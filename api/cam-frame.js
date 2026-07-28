import { kv } from '@vercel/kv';

if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
  process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
}
if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
  process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
}

let memoryFrames = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const roomCode = String(req.query.code || req.body?.code || '').toUpperCase();
  if (!roomCode) {
    return res.status(400).json({ error: 'Room code required' });
  }

  if (req.method === 'GET') {
    try {
      let frames = {};
      try {
        const raw = await kv.get(`cam_frames:${roomCode}`);
        frames = raw || {};
      } catch (e) {
        frames = memoryFrames.get(roomCode) || {};
      }
      return res.status(200).json({ frames });
    } catch (err) {
      return res.status(200).json({ frames: memoryFrames.get(roomCode) || {} });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { peerId, frame } = body;
      if (!peerId || !frame) {
        return res.status(400).json({ error: 'peerId and frame required' });
      }

      let current = {};
      try {
        current = (await kv.get(`cam_frames:${roomCode}`)) || {};
      } catch (e) {
        current = memoryFrames.get(roomCode) || {};
      }

      current[peerId] = {
        frame,
        timestamp: Date.now()
      };

      // Clean up stale frames older than 15 seconds
      const now = Date.now();
      Object.keys(current).forEach(k => {
        if (now - current[k].timestamp > 15000) {
          delete current[k];
        }
      });

      try {
        await kv.set(`cam_frames:${roomCode}`, current, { ex: 300 });
      } catch (e) {
        memoryFrames.set(roomCode, current);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
