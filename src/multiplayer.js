/**
 * Multiplayer Manager - Zero-Config P2P Room Connection, State Synchronization,
 * WebRTC Mesh Video, and Match Loop Integration powered by PeerJS & Vercel KV.
 */

import { Peer } from 'peerjs';
import { WebRTCManager } from './webrtc.js';
import { MultiplayerUIManager } from './multiplayerUI.js';

export class MultiplayerManager {
  constructor(gameManager, uiManager) {
    this.game = gameManager;
    this.appUI = uiManager;

    this.mpUI = new MultiplayerUIManager();
    this.webrtc = null;
    this.peer = null;
    this.hostConn = null; // Guest's connection to Host
    this.guestConns = new Map(); // Host's map of guest connections (peerId -> DataConnection)
    this.mediaCalls = new Map(); // Map of active MediaConnection streams (peerId -> call)

    this.currentRoomCode = null;
    this.myId = null;
    this.isHost = false;
    this.roomState = null;
    this.timerInterval = null;

    this.isPC = WebRTCManager.isSupportedOnDevice();

    this.initEvents();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  initEvents() {
    // Submenu Buttons
    this.mpUI.mpSubmenuCreateBtn.addEventListener('click', () => {
      this.mpUI.showCreateView();
    });

    this.mpUI.mpSubmenuJoinBtn.addEventListener('click', () => {
      this.mpUI.showJoinView();
      this.fetchPublicRooms();
    });

    this.mpUI.mpBackToMainMenuBtn.addEventListener('click', () => {
      this.mpUI.hideAllMPModals();
      this.appUI.showMainMenu(this.game.currentLevel);
    });

    this.mpUI.mpCreateBackBtn.addEventListener('click', () => {
      this.mpUI.showSubmenu();
    });

    this.mpUI.mpJoinBackBtn.addEventListener('click', () => {
      this.mpUI.showSubmenu();
    });

    // Create Room Difficulty Buttons
    this.mpUI.mpCreateDiffBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mpUI.mpCreateDiffBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.mpUI.selectedDiff = btn.dataset.diff;
      });
    });

    // Confirm Create Room
    this.mpUI.mpConfirmCreateBtn.addEventListener('click', () => {
      const isPublic = this.mpUI.mpRoomVisibilityToggle.checked;
      const difficulty = this.mpUI.selectedDiff;
      const roomCode = this.generateRoomCode();
      this.createAndJoinRoom(roomCode, isPublic, difficulty);
    });

    // Join Room by Code Input
    this.mpUI.mpJoinByCodeBtn.addEventListener('click', () => {
      const inputVal = (this.mpUI.mpCodeInput.value || '').trim();
      const code = this.extractRoomCode(inputVal);
      if (code) {
        this.joinRoom(code);
      } else {
        alert('Please enter a valid 6-character room code or invite URL.');
      }
    });

    // Refresh Public Rooms List
    if (this.mpUI.mpRefreshPublicBtn) {
      this.mpUI.mpRefreshPublicBtn.addEventListener('click', () => {
        this.fetchPublicRooms();
      });
    }

    // Copy Code & Copy Link Buttons
    this.mpUI.mpCopyCodeBtn.addEventListener('click', () => {
      const code = (this.currentRoomCode || this.roomState?.roomCode || document.getElementById('mp-lobby-code')?.textContent || '').trim();
      this.copyTextToClipboard(code, this.mpUI.mpCopyCodeBtn, 'Copied! ✓', '📋 Copy Code');
    });

    this.mpUI.mpCopyLinkBtn.addEventListener('click', () => {
      const code = (this.currentRoomCode || this.roomState?.roomCode || document.getElementById('mp-lobby-code')?.textContent || '').trim();
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      this.copyTextToClipboard(url, this.mpUI.mpCopyLinkBtn, 'Link Copied! ✓', '🔗 Copy Share Link');
    });

    // Host Controls: See Others Toggle
    if (this.mpUI.mpSeeOthersToggle) {
      this.mpUI.mpSeeOthersToggle.addEventListener('change', (e) => {
        if (this.isHost && this.roomState) {
          this.roomState.seeOthers = e.target.checked;
          this.broadcastStateToGuests();
          this.onRoomStateChanged();
        }
      });
    }

    // Host Controls: Start Match
    if (this.mpUI.mpStartMatchBtn) {
      this.mpUI.mpStartMatchBtn.addEventListener('click', () => {
        if (this.isHost && this.roomState) {
          this.roomState.matchState = 'playing';
          this.roomState.matchEndsAt = Date.now() + 60000;
          this.roomState.players.forEach((p) => (p.score = 0));
          this.broadcastStateToGuests();
          this.onRoomStateChanged();
        }
      });
    }

    // Leave Lobby
    if (this.mpUI.mpLeaveLobbyBtn) {
      this.mpUI.mpLeaveLobbyBtn.addEventListener('click', () => {
        this.leaveRoom();
        this.mpUI.showSubmenu();
      });
    }

    // Results Modal Buttons
    if (this.mpUI.mpPlayAgainBtn) {
      this.mpUI.mpPlayAgainBtn.addEventListener('click', () => {
        if (this.isHost && this.roomState) {
          this.roomState.matchState = 'lobby';
          this.roomState.matchEndsAt = null;
          this.roomState.players.forEach((p) => {
            p.score = 0;
            p.ready = p.isHost;
          });
          this.broadcastStateToGuests();
          this.onRoomStateChanged();
        }
      });
    }

    if (this.mpUI.mpResultsMenuBtn) {
      this.mpUI.mpResultsMenuBtn.addEventListener('click', () => {
        this.leaveRoom();
        this.mpUI.hideAllMPModals();
        this.appUI.showMainMenu(this.game.currentLevel);
      });
    }

    // Check URL parameters for direct invite join on app boot
    this.checkURLJoin();
  }

  copyTextToClipboard(text, btnEl, successLabel, defaultHTML) {
    const targetText = text || this.currentRoomCode || document.getElementById('mp-lobby-code')?.textContent || '';
    if (!targetText) return;

    let copied = false;
    try {
      const textarea = document.createElement('textarea');
      textarea.value = targetText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {}

    if (!copied && navigator.clipboard) {
      navigator.clipboard.writeText(targetText).catch(() => {});
    }

    if (btnEl) {
      btnEl.innerHTML = successLabel;
      setTimeout(() => {
        btnEl.innerHTML = defaultHTML;
      }, 2000);
    }
  }

  extractRoomCode(input) {
    if (!input) return '';
    if (input.length === 6) return input.toUpperCase();
    try {
      const url = new URL(input);
      return url.searchParams.get('room')?.toUpperCase() || '';
    } catch (e) {
      return input.trim().toUpperCase();
    }
  }

  checkURLJoin() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode && roomCode.length === 6) {
      setTimeout(() => {
        const playerName = this.appUI.getPlayerName();
        if (!playerName) {
          this.appUI.showNameEntry();
        } else {
          this.joinRoom(roomCode.toUpperCase());
        }
      }, 500);
    }
  }

  async fetchPublicRooms() {
    const publicRooms = [];

    // Query Vercel KV public rooms API
    try {
      const res = await fetch('/api/public-rooms');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.rooms)) {
          data.rooms.forEach(r => publicRooms.push(r));
        }
      }
    } catch (e) {}

    // Check local storage cache fallback
    try {
      const raw = localStorage.getItem('fruit_slice_recent_public_room');
      if (raw) {
        const item = JSON.parse(raw);
        if (Date.now() - item.timestamp < 1800000) { // 30 mins
          if (!publicRooms.some(p => p.code === item.code)) {
            publicRooms.push(item);
          }
        }
      }
    } catch (e) {}

    this.mpUI.renderPublicRooms(publicRooms, (code) => this.joinRoom(code));
  }

  createAndJoinRoom(roomCode, isPublic, difficulty) {
    this.disconnectPeer();

    this.currentRoomCode = roomCode.toUpperCase();
    this.isHost = true;
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
    const hostPeerId = `fruitslice-room-${this.currentRoomCode}`;
    this.myId = hostPeerId;

    this.roomState = {
      roomCode: this.currentRoomCode,
      isPublic,
      difficulty,
      seeOthers: true,
      hostId: hostPeerId,
      matchState: 'lobby',
      matchEndsAt: null,
      players: [
        { id: hostPeerId, name: playerName, isHost: true, ready: true, score: 0 }
      ]
    };

    this.mpUI.showLobby();
    this.mpUI.renderLobbyState(this.roomState, this.myId);

    // Register with Vercel KV serverless API if public
    if (isPublic) {
      const publicRoomObj = {
        code: this.currentRoomCode,
        hostName: playerName,
        difficulty,
        playerCount: 1,
        timestamp: Date.now()
      };
      try {
        localStorage.setItem('fruit_slice_recent_public_room', JSON.stringify(publicRoomObj));
      } catch (e) {}
      try {
        fetch('/api/public-rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publicRoomObj)
        }).catch(() => {});
      } catch (e) {}
    }

    // Initialize Host PeerJS Server Connection
    try {
      this.peer = new Peer(hostPeerId, { debug: 1 });

      this.peer.on('open', () => {
        console.log('P2P Host Room initialized with Peer ID:', hostPeerId);
      });

      this.peer.on('connection', (conn) => {
        this.setupHostConnection(conn);
      });

      this.peer.on('call', (call) => {
        this.handleIncomingMediaCall(call);
      });

      this.peer.on('error', (err) => {
        console.warn('Host PeerJS warning:', err);
      });
    } catch (err) {
      console.error('PeerJS init failed:', err);
    }
  }

  setupHostConnection(conn) {
    this.guestConns.set(conn.peer, conn);

    conn.on('data', (data) => {
      let msg;
      try { msg = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return; }

      if (msg.type === 'join') {
        if (this.roomState.players.length >= 4) {
          conn.send(JSON.stringify({ type: 'error', message: 'Room full (Max 4 players)' }));
          conn.close();
          return;
        }

        const existingPlayer = this.roomState.players.find((p) => p.id === conn.peer);
        if (!existingPlayer) {
          this.roomState.players.push({
            id: conn.peer,
            name: String(msg.name || 'Ninja Slicer').trim().substring(0, 15),
            isHost: false,
            ready: true,
            score: 0
          });
        }

        // Send initial room state to newly joined guest
        conn.send(JSON.stringify({
          type: 'init',
          yourId: conn.peer,
          state: this.roomState
        }));

        // Broadcast updated room state to all guests
        this.broadcastStateToGuests();
        this.onRoomStateChanged();

        // Update public room player count
        if (this.roomState.isPublic) {
          fetch('/api/public-rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: this.currentRoomCode,
              hostName: this.roomState.players[0]?.name || 'Host',
              difficulty: this.roomState.difficulty,
              playerCount: this.roomState.players.length
            })
          }).catch(() => {});
        }
      } else if (msg.type === 'score-update') {
        const player = this.roomState.players.find((p) => p.id === conn.peer);
        if (player) {
          player.score = Math.max(0, Number(msg.score) || 0);
          this.broadcastStateToGuests();
          this.onRoomStateChanged();
        }
      }
    });

    conn.on('close', () => {
      this.guestConns.delete(conn.peer);
      this.roomState.players = this.roomState.players.filter((p) => p.id !== conn.peer);
      this.broadcastStateToGuests();
      this.onRoomStateChanged();
    });
  }

  joinRoom(roomCode) {
    this.disconnectPeer();

    this.currentRoomCode = roomCode.toUpperCase();
    this.isHost = false;
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
    const hostPeerId = `fruitslice-room-${this.currentRoomCode}`;

    this.roomState = {
      roomCode: this.currentRoomCode,
      isPublic: true,
      difficulty: 'medium',
      seeOthers: true,
      hostId: hostPeerId,
      matchState: 'lobby',
      matchEndsAt: null,
      players: [
        { id: 'connecting', name: playerName, isHost: false, ready: true, score: 0 }
      ]
    };

    this.mpUI.showLobby();
    this.mpUI.renderLobbyState(this.roomState, this.myId);

    // Initialize Guest PeerJS Client Connection
    try {
      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', (guestPeerId) => {
        this.myId = guestPeerId;

        // Connect to Host Peer
        this.hostConn = this.peer.connect(hostPeerId, { reliable: true });

        this.hostConn.on('open', () => {
          this.hostConn.send(JSON.stringify({
            type: 'join',
            name: playerName,
            peerId: guestPeerId
          }));
        });

        this.hostConn.on('data', (data) => {
          let msg;
          try { msg = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return; }

          if (msg.type === 'init' || msg.type === 'state-update') {
            if (msg.yourId) this.myId = msg.yourId;
            this.roomState = msg.state;
            this.onRoomStateChanged();
          } else if (msg.type === 'error') {
            alert(msg.message || 'Error joining room');
            this.leaveRoom();
            this.mpUI.showSubmenu();
          }
        });

        this.hostConn.on('close', () => {
          alert('Host has disconnected or room ended.');
          this.leaveRoom();
          this.game.stopGame();
          this.mpUI.hideAllMPModals();
          this.appUI.showMainMenu(this.game.currentLevel);
        });
      });

      this.peer.on('call', (call) => {
        this.handleIncomingMediaCall(call);
      });

      this.peer.on('error', (err) => {
        console.warn('Guest PeerJS warning:', err);
      });
    } catch (err) {
      console.error('Guest PeerJS init error:', err);
    }
  }

  broadcastStateToGuests() {
    if (!this.isHost || !this.roomState) return;
    const payload = JSON.stringify({
      type: 'state-update',
      state: this.roomState
    });

    for (const [peerId, conn] of this.guestConns) {
      if (conn && conn.open) {
        conn.send(payload);
      }
    }
  }

  sendScoreToHost(score) {
    if (this.isHost) {
      const hostPlayer = this.roomState?.players.find((p) => p.id === this.myId);
      if (hostPlayer) {
        hostPlayer.score = score;
        this.broadcastStateToGuests();
        this.onRoomStateChanged();
      }
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(JSON.stringify({
        type: 'score-update',
        score
      }));
    }
  }

  handleIncomingMediaCall(call) {
    let localStream = null;
    if (this.game.camera && this.game.camera.video && this.game.camera.video.srcObject) {
      localStream = this.game.camera.video.srcObject;
    }

    call.answer(localStream);
    call.on('stream', (remoteStream) => {
      this.mpUI.attachRemoteVideoStream(call.peer, remoteStream);
    });
  }

  callPeerVideo(peerId) {
    if (!this.peer || this.mediaCalls.has(peerId)) return;
    let localStream = null;
    if (this.game.camera && this.game.camera.video && this.game.camera.video.srcObject) {
      localStream = this.game.camera.video.srcObject;
    }

    const call = this.peer.call(peerId, localStream);
    if (call) {
      this.mediaCalls.set(peerId, call);
      call.on('stream', (remoteStream) => {
        this.mpUI.attachRemoteVideoStream(peerId, remoteStream);
      });
    }
  }

  onRoomStateChanged() {
    if (!this.roomState) return;

    const { matchState, players, seeOthers, difficulty, matchEndsAt } = this.roomState;

    if (matchState === 'lobby') {
      this.game.stopGame();
      this.mpUI.hideSidebarPOV();
      this.mpUI.hideTimerHUD();

      this.mpUI.showLobby();
      this.mpUI.renderLobbyState(this.roomState, this.myId);
    } else if (matchState === 'playing') {
      this.mpUI.hideAllMPModals();

      // Ensure local match loop runs in multiplayer mode
      this.game.stopGame();
      this.game.startMultiplayerGame(difficulty, (newScore) => {
        this.sendScoreToHost(newScore);
      });

      // Initiate WebRTC Media Calls if PC & seeOthers ON
      if (this.isPC && seeOthers) {
        players.forEach((p) => {
          if (p.id !== this.myId && p.id !== 'connecting') {
            this.callPeerVideo(p.id);
          }
        });
      }

      // Render PC Sidebar POV overlay
      this.mpUI.renderSidebarPOV(players, this.myId, seeOthers, this.isPC);

      // Start authoritative Match Timer
      this.startMatchTimer(matchEndsAt);
    } else if (matchState === 'ended') {
      this.game.stopGame();
      this.stopMatchTimer();

      const isHost = this.roomState.hostId === this.myId || this.isHost;
      this.mpUI.renderResults(players, isHost);
      this.mpUI.showResults();
    }
  }

  startMatchTimer(matchEndsAt) {
    this.stopMatchTimer();

    const updateTimer = () => {
      const now = Date.now();
      const remainingMs = Math.max(0, matchEndsAt - now);
      const remainingSecs = Math.ceil(remainingMs / 1000);

      this.mpUI.showTimerHUD(remainingSecs);

      if (remainingMs <= 0) {
        this.stopMatchTimer();
      }
    };

    updateTimer();
    this.timerInterval = setInterval(updateTimer, 500);
  }

  stopMatchTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.mpUI.hideTimerHUD();
  }

  disconnectPeer() {
    this.stopMatchTimer();
    for (const [peerId, call] of this.mediaCalls) {
      try { call.close(); } catch (e) {}
    }
    this.mediaCalls.clear();

    for (const [peerId, conn] of this.guestConns) {
      try { conn.close(); } catch (e) {}
    }
    this.guestConns.clear();

    if (this.hostConn) {
      try { this.hostConn.close(); } catch (e) {}
      this.hostConn = null;
    }

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
  }

  leaveRoom() {
    this.disconnectPeer();
    this.currentRoomCode = null;
    this.roomState = null;
    this.myId = null;
    this.isHost = false;
  }
}
