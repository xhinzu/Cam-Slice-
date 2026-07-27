import { kv } from '@vercel/kv';

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
    const { name, score } = body || {};

    const cleanName = (name || '').trim().substring(0, 20);
    const numScore = Number(score);

    if (!cleanName || isNaN(numScore) || numScore < 0 || numScore > 9999) {
      return res.status(400).json({ error: 'Invalid name or score. Name must be non-empty string <= 20 chars, score 0-9999.' });
    }

    // Check existing score in sorted set 'leaderboard'
    const existingScore = await kv.zscore('leaderboard', cleanName);

    if (existingScore === null || numScore > Number(existingScore)) {
      // Add or update member score in sorted set
      await kv.zadd('leaderboard', { score: numScore, member: cleanName });
    }

    return res.status(200).json({
      success: true,
      name: cleanName,
      score: numScore,
      updated: existingScore === null || numScore > Number(existingScore)
    });
  } catch (error) {
    console.error('Error submitting score to Vercel KV:', error);
    return res.status(500).json({ error: 'Internal server error processing score submission.' });
  }
}
