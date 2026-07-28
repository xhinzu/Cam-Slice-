import type { Server, Connection, Party } from "partykit/server";

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  score: number;
}

interface RoomData {
  roomCode: string;
  isPublic: boolean;
  difficulty: "easy" | "medium" | "hard";
  seeOthers: boolean;
  hostId: string;
  matchState: "lobby" | "playing" | "ended";
  matchEndsAt: number | null;
  players: Player[];
}

export default class MultiplayerRoomServer implements Server {
  party: Party;
  roomData: RoomData;
  matchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(party: Party) {
    this.party = party;
    this.roomData = {
      roomCode: party.id,
      isPublic: true,
      difficulty: "medium",
      seeOthers: true,
      hostId: "",
      matchState: "lobby",
      matchEndsAt: null,
      players: []
    };
  }

  // Helper to send state to all connections
  broadcastState() {
    this.party.broadcast(
      JSON.stringify({
        type: "state-update",
        state: this.roomData
      })
    );
  }

  onConnect(conn: Connection) {
    // If this is the public room registry room
    if (this.party.id === "lobby") {
      return;
    }

    // Check player limit (Max 4 players)
    if (this.roomData.players.length >= 4) {
      conn.send(JSON.stringify({ type: "error", message: "Room full (Max 4 players)" }));
      conn.close();
      return;
    }

    const isFirstPlayer = this.roomData.players.length === 0;
    if (isFirstPlayer) {
      this.roomData.hostId = conn.id;
    }

    const newPlayer: Player = {
      id: conn.id,
      name: `Player ${this.roomData.players.length + 1}`,
      isHost: isFirstPlayer,
      ready: isFirstPlayer,
      score: 0
    };

    this.roomData.players.push(newPlayer);

    // Send initial state to the connecting client
    conn.send(
      JSON.stringify({
        type: "init",
        yourId: conn.id,
        state: this.roomData
      })
    );

    // Broadcast updated state to all peers
    this.broadcastState();
  }

  onMessage(message: string, sender: Connection) {
    let data: any;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    const player = this.roomData.players.find((p) => p.id === sender.id);

    switch (data.type) {
      case "create-room-config": {
        if (player && player.isHost) {
          if (typeof data.isPublic === "boolean") this.roomData.isPublic = data.isPublic;
          if (data.difficulty) this.roomData.difficulty = data.difficulty;
          if (typeof data.seeOthers === "boolean") this.roomData.seeOthers = data.seeOthers;
          this.broadcastState();
        }
        break;
      }

      case "set-name": {
        if (player && data.name) {
          player.name = String(data.name).trim().substring(0, 15) || player.name;
          this.broadcastState();
        }
        break;
      }

      case "toggle-ready": {
        if (player) {
          player.ready = !player.ready;
          this.broadcastState();
        }
        break;
      }

      case "set-see-others": {
        if (player && player.isHost) {
          this.roomData.seeOthers = Boolean(data.seeOthers);
          this.broadcastState();
        }
        break;
      }

      case "set-difficulty": {
        if (player && player.isHost && ["easy", "medium", "hard"].includes(data.difficulty)) {
          this.roomData.difficulty = data.difficulty;
          this.broadcastState();
        }
        break;
      }

      case "start-match": {
        if (player && player.isHost && this.roomData.players.length >= 2) {
          this.roomData.matchState = "playing";
          const DURATION_MS = 60000;
          this.roomData.matchEndsAt = Date.now() + DURATION_MS;
          
          // Reset all player scores
          this.roomData.players.forEach(p => p.score = 0);

          this.broadcastState();

          // Clear existing timer if any
          if (this.matchTimer) clearTimeout(this.matchTimer);

          // Schedule match end after 60s
          this.matchTimer = setTimeout(() => {
            this.roomData.matchState = "ended";
            this.broadcastState();
          }, DURATION_MS);
        }
        break;
      }

      case "score-update": {
        if (player && this.roomData.matchState === "playing") {
          player.score = Math.max(0, Number(data.score) || 0);
          this.broadcastState();
        }
        break;
      }

      case "restart-lobby": {
        if (player && player.isHost) {
          if (this.matchTimer) clearTimeout(this.matchTimer);
          this.roomData.matchState = "lobby";
          this.roomData.matchEndsAt = null;
          this.roomData.players.forEach(p => {
            p.score = 0;
            p.ready = p.isHost;
          });
          this.broadcastState();
        }
        break;
      }

      case "signal": {
        // WebRTC signaling relay (targetId, signalData)
        if (data.targetId && data.signalData) {
          const targetConn = [...this.party.getConnections()].find(c => c.id === data.targetId);
          if (targetConn) {
            targetConn.send(
              JSON.stringify({
                type: "signal",
                senderId: sender.id,
                signalData: data.signalData
              })
            );
          }
        }
        break;
      }
    }
  }

  onClose(conn: Connection) {
    if (this.party.id === "lobby") return;

    const wasHost = this.roomData.hostId === conn.id;
    this.roomData.players = this.roomData.players.filter((p) => p.id !== conn.id);

    if (wasHost && this.roomData.players.length > 0) {
      // Host left: Notify remaining players host disconnected & end room
      this.party.broadcast(
        JSON.stringify({
          type: "host-disconnected",
          message: "The room host has disconnected."
        })
      );
    } else {
      this.broadcastState();
    }
  }
}
