import { kv } from '@vercel/kv';

if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
  process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
}
if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
  process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
}

let inMemoryRoomStore = new Map();

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

  const kvKey = `mp_room:${roomCode}`;

  if (req.method === 'GET') {
    try {
      let state = null;
      try {
        state = await kv.get(kvKey);
      } catch (e) {
        state = inMemoryRoomStore.get(roomCode);
      }
      return res.status(200).json({ state: state || null });
    } catch (err) {
      return res.status(200).json({ state: inMemoryRoomStore.get(roomCode) || null });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { action, player, state, score, matchState, matchEndsAt, seeOthers } = body;

      let current = null;
      try {
        current = await kv.get(kvKey);
      } catch (e) {
        current = inMemoryRoomStore.get(roomCode);
      }

      if (action === 'create') {
        current = state || {
          roomCode,
          isPublic: body.isPublic ?? true,
          difficulty: body.difficulty || 'medium',
          seeOthers: true,
          hostId: player.id,
          matchState: 'lobby',
          matchEndsAt: null,
          players: [player],
          updatedAt: Date.now()
        };
      } else if (action === 'join' && current) {
        if (!current.players) current.players = [];
        const existingIdx = current.players.findIndex(p => p.id === player.id || p.name === player.name);
        if (existingIdx >= 0) {
          current.players[existingIdx] = { ...current.players[existingIdx], ...player };
        } else if (current.players.length < 4) {
          current.players.push(player);
        }
      } else if (action === 'update' && current) {
        if (state) {
          current = { ...current, ...state };
        }
        if (matchState) current.matchState = matchState;
        if (matchEndsAt !== undefined) current.matchEndsAt = matchEndsAt;
        if (seeOthers !== undefined) current.seeOthers = seeOthers;

        if (player && current.players) {
          let idx = current.players.findIndex(p => p.id === player.id);
          if (idx < 0 && player.name) {
            idx = current.players.findIndex(p => p.name === player.name);
          }
          if (idx < 0 && (player.isHost || (typeof player.id === 'string' && player.id.startsWith('host')))) {
            idx = current.players.findIndex(p => p.isHost);
          }
          if (idx >= 0) {
            current.players[idx] = { ...current.players[idx], ...player };
          }
        }
      } else if (action === 'score-update' && current) {
        if (player && current.players) {
          let idx = current.players.findIndex(p => p.id === player.id);
          if (idx < 0 && player.name) {
            idx = current.players.findIndex(p => p.name === player.name);
          }
          if (idx < 0 && (player.isHost || (typeof player.id === 'string' && player.id.startsWith('host')))) {
            idx = current.players.findIndex(p => p.isHost);
          }
          if (idx >= 0) {
            current.players[idx].score = Math.max(0, Number(score) || 0);
            if (player.id) current.players[idx].id = player.id;
          }
        }
      } else if (action === 'leave' && current && player) {
        if (current.players) {
          current.players = current.players.filter(p => p.id !== player.id && p.name !== player.name);
        }
      }

      if (current) {
        current.updatedAt = Date.now();
        try {
          await kv.set(kvKey, current, { ex: 1800 }); // 30 min expiration
        } catch (e) {
          inMemoryRoomStore.set(roomCode, current);
        }
      }

      return res.status(200).json({ success: true, state: current });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
