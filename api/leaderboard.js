import { kv } from '@vercel/kv';

// Polyfill env vars if provisioned via Upstash Integration
if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
  process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
}
if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
  process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const blockedNames = ['sreedev', 'zhinsu'];

    // Ensure Xhinzu (88) & Dingan (45) in KV if missing or lower
    try {
      const xScore = await kv.zscore('leaderboard', 'Xhinzu');
      if (xScore === null || Number(xScore) < 88) {
        await kv.zadd('leaderboard', { score: 88, member: 'Xhinzu' });
      }
      const dScore = await kv.zscore('leaderboard', 'Dingan');
      if (dScore === null || Number(dScore) < 45) {
        await kv.zadd('leaderboard', { score: 45, member: 'Dingan' });
      }
    } catch (e) {
      // ignore KV write errors
    }

    // Retrieve top 20 from sorted set 'leaderboard' descending
    const rawResult = await kv.zrange('leaderboard', 0, 19, { rev: true, withScores: true });

    const formattedList = [];

    if (Array.isArray(rawResult)) {
      // Handles both alternating array ['Name', score, ...] and object array [{ member, score }]
      for (let i = 0; i < rawResult.length; i++) {
        const item = rawResult[i];
        let name = '';
        let score = 0;

        if (typeof item === 'object' && item !== null && 'member' in item) {
          name = item.member;
          score = Number(item.score || 0);
        } else if (typeof item === 'string' && i + 1 < rawResult.length) {
          name = item;
          score = Number(rawResult[i + 1] || 0);
          i++; // Skip score index
        }

        if (name) {
          if (blockedNames.includes(name.toLowerCase())) {
            // Delete from Redis KV store
            try {
              await kv.zrem('leaderboard', name);
            } catch (e) {
              console.warn('Could not zrem blocked name:', name, e);
            }
            continue;
          }
          formattedList.push({ name, score });
        }
      }
    }

    // Ensure Xhinzu is present with score 88 if not already in list
    const hasXhinzu = formattedList.some(item => item.name.toLowerCase() === 'xhinzu');
    if (!hasXhinzu) {
      formattedList.push({ name: 'Xhinzu', score: 88 });
    } else {
      formattedList.forEach(item => {
        if (item.name.toLowerCase() === 'xhinzu' && item.score < 88) {
          item.score = 88;
        }
      });
    }

    // Ensure Dingan is present with score 45 if not already in list
    const hasDingan = formattedList.some(item => item.name.toLowerCase() === 'dingan');
    if (!hasDingan) {
      formattedList.push({ name: 'Dingan', score: 45 });
    } else {
      formattedList.forEach(item => {
        if (item.name.toLowerCase() === 'dingan' && item.score < 45) {
          item.score = 45;
        }
      });
    }

    formattedList.sort((a, b) => b.score - a.score);

    return res.status(200).json(formattedList.slice(0, 10));
  } catch (error) {
    console.error('Error fetching leaderboard from Vercel Redis/KV:', error);
    return res.status(500).json({ error: 'Internal server error fetching leaderboard.' });
  }
}
