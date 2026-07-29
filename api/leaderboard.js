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
    const blockedNames = ['sreedev', 'zhinsu', 'rigved'];
    const mode = req.query ? (req.query.mode || 'fruit-slice') : 'fruit-slice';
    const modeKey = mode === 'punch-glass' ? 'leaderboard:punch-glass' : 'leaderboard';

    // Remove capitalized 'Xhinzu' from Redis KV store and ensure lowercase 'xhinzu' has 88 & 'Dingan' has 45
    try {
      await kv.zrem(modeKey, 'Xhinzu');
      
      const xScore = await kv.zscore(modeKey, 'xhinzu');
      if (xScore === null || Number(xScore) < 88) {
        await kv.zadd(modeKey, { score: 88, member: 'xhinzu' });
      }

      const dScore = await kv.zscore(modeKey, 'Dingan');
      if (dScore === null || Number(dScore) < 45) {
        await kv.zadd(modeKey, { score: 45, member: 'Dingan' });
      }
    } catch (e) {
      // ignore KV write errors
    }

    // Retrieve top 20 from sorted set modeKey descending
    const rawResult = await kv.zrange(modeKey, 0, 19, { rev: true, withScores: true });

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
          if (name === 'Xhinzu') {
            try { await kv.zrem('leaderboard', 'Xhinzu'); } catch (e) {}
            continue;
          }
          if (blockedNames.includes(name.toLowerCase())) {
            try { await kv.zrem(modeKey, name); } catch (e) {}
            continue;
          }
          formattedList.push({ name, score });
        }
      }
    }

    // Deduplicate case-insensitively
    const dedupedMap = new Map();
    formattedList.forEach(item => {
      const lower = item.name.toLowerCase();
      if (!dedupedMap.has(lower) || item.score > dedupedMap.get(lower).score) {
        dedupedMap.set(lower, item);
      }
    });

    const cleanList = Array.from(dedupedMap.values());

    // Ensure lowercase xhinzu with score 88
    const xItem = cleanList.find(item => item.name.toLowerCase() === 'xhinzu');
    if (!xItem) {
      cleanList.push({ name: 'xhinzu', score: 88 });
    } else {
      xItem.name = 'xhinzu'; // Force lowercase
      if (xItem.score < 88) xItem.score = 88;
    }

    // Ensure Dingan with score 45
    const dItem = cleanList.find(item => item.name.toLowerCase() === 'dingan');
    if (!dItem) {
      cleanList.push({ name: 'Dingan', score: 45 });
    } else if (dItem.score < 45) {
      dItem.score = 45;
    }

    cleanList.sort((a, b) => b.score - a.score);

    return res.status(200).json(cleanList.slice(0, 10));
  } catch (error) {
    console.error('Error fetching leaderboard from Vercel Redis/KV:', error);
    return res.status(500).json({ error: 'Internal server error fetching leaderboard.' });
  }
}
