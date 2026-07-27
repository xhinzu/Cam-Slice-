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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, score, mode } = body || {};

    const cleanName = (name || '').trim().substring(0, 20);
    const numScore = Number(score);
    const modeKey = mode === 'punch-glass' ? 'leaderboard:punch-glass' : 'leaderboard';
    const blockedNames = ['sreedev', 'zhinsu'];

    if (!cleanName || isNaN(numScore) || numScore < 0 || numScore > 9999 || blockedNames.includes(cleanName.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid or restricted player name.' });
    }

    // Check existing score in mode sorted set
    const existingScore = await kv.zscore(modeKey, cleanName);

    if (existingScore === null || numScore > Number(existingScore)) {
      // Add or update member score in sorted set
      await kv.zadd(modeKey, { score: numScore, member: cleanName });
    }

    return res.status(200).json({
      success: true,
      name: cleanName,
      score: numScore,
      updated: existingScore === null || numScore > Number(existingScore)
    });
  } catch (error) {
    console.error('Error submitting score to Vercel Redis/KV:', error);
    return res.status(500).json({ error: 'Internal server error processing score submission.' });
  }
}
