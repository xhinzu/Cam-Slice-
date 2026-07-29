import { kv } from '@vercel/kv';

if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
  process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
}
if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
  process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
}

let memoryRooms = [];

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

  if (req.method === 'GET') {
    try {
      let rooms = [];
      try {
        const raw = await kv.get('public_rooms_list');
        rooms = Array.isArray(raw) ? raw : [];
      } catch (e) {
        rooms = memoryRooms;
      }

      const now = Date.now();
      const activeRooms = rooms.filter(r => r && (now - r.timestamp < 1800000));

      return res.status(200).json({ rooms: activeRooms });
    } catch (err) {
      return res.status(200).json({ rooms: memoryRooms });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { code, hostName, difficulty, playerCount } = body;
      if (!code) {
        return res.status(400).json({ error: 'Room code required' });
      }

      const targetCode = String(code).toUpperCase();

      if (action === 'delete') {
        try {
          let current = await kv.get('public_rooms_list');
          if (Array.isArray(current)) {
            current = current.filter(r => r && r.code !== targetCode);
            await kv.set('public_rooms_list', current);
          }
        } catch (e) {}
        memoryRooms = memoryRooms.filter(r => r && r.code !== targetCode);
        return res.status(200).json({ success: true, deleted: true });
      }

      const newEntry = {
        code: targetCode,
        hostName: String(hostName || 'Host').substring(0, 15),
        difficulty: String(difficulty || 'medium'),
        playerCount: Number(playerCount || 1),
        timestamp: Date.now()
      };

      try {
        let current = await kv.get('public_rooms_list');
        if (!Array.isArray(current)) current = [];
        current = current.filter(r => r && r.code !== newEntry.code && (Date.now() - r.timestamp < 1800000));
        current.unshift(newEntry);
        await kv.set('public_rooms_list', current.slice(0, 20));
      } catch (e) {
        memoryRooms = memoryRooms.filter(r => r && r.code !== newEntry.code && (Date.now() - r.timestamp < 1800000));
        memoryRooms.unshift(newEntry);
      }

      return res.status(200).json({ success: true, room: newEntry });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
