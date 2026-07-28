/**
 * Multiplayer Manager - Cross-Network Real-Time Multiplayer powered by
 * Vercel KV State Synchronization & WebRTC Multi-STUN Video Mesh.
 */

import { Peer } from 'peerjs';
import { WebRTCManager } from './webrtc.js';
import { MultiplayerUIManager } from './multiplayerUI.js';

export class MultiplayerManager {
  constructor(gameManager, uiManager) {
    this.game = gameManager;
    this.appUI = uiManager;

    this.mpUI = new MultiplayerUIManager();
    this.peer = null;
    this.guestConns = new Map();
    this.hostConn = null;
    this.mediaCalls = new Map();

    this.currentRoomCode = null;
    this.myId = null;
    this.isHost = false;
    this.roomState = null;
    this.timerInterval = null;
    this.syncPollerInterval = null;

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
          this.pushRoomStateToServer({ action: 'update', seeOthers: e.target.checked });
          this.onRoomStateChanged();
        }
      });
    }

    // Host Controls: Start Match
    if (this.mpUI.mpStartMatchBtn) {
      this.mpUI.mpStartMatchBtn.addEventListener('click', () => {
        if (this.isHost && this.roomState) {
          const matchEndsAt = Date.now() + 60000;
          this.roomState.matchState = 'playing';
          this.roomState.matchEndsAt = matchEndsAt;
          this.roomState.players.forEach((p) => (p.score = 0));
          this.pushRoomStateToServer({ action: 'update', matchState: 'playing', matchEndsAt });
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
          this.pushRoomStateToServer({ action: 'update', matchState: 'lobby', matchEndsAt: null });
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

    // Local storage cache fallback
    try {
      const raw = localStorage.getItem('fruit_slice_recent_public_room');
      if (raw) {
        const item = JSON.parse(raw);
        if (Date.now() - item.timestamp < 1800000) {
          if (!publicRooms.some(p => p.code === item.code)) {
            publicRooms.push(item);
          }
        }
      }
    } catch (e) {}

    this.mpUI.renderPublicRooms(publicRooms, (code) => this.joinRoom(code));
  }

  async createAndJoinRoom(roomCode, isPublic, difficulty) {
    this.disconnectPeer();

    this.currentRoomCode = roomCode.toUpperCase();
    this.isHost = true;
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
    this.myId = 'host-' + Math.random().toString(36).substring(2, 7);

    const initialHostPlayer = {
      id: this.myId,
      name: playerName,
      isHost: true,
      ready: true,
      score: 0
    };

    this.roomState = {
      roomCode: this.currentRoomCode,
      isPublic,
      difficulty,
      seeOthers: true,
      hostId: this.myId,
      matchState: 'lobby',
      matchEndsAt: null,
      players: [initialHostPlayer]
    };

    this.mpUI.showLobby();
    this.mpUI.renderLobbyState(this.roomState, this.myId);

    // 1. Post to Vercel KV Room State API for global cross-network discovery & sync
    await this.pushRoomStateToServer({
      action: 'create',
      player: initialHostPlayer,
      state: this.roomState
    });

    if (isPublic) {
      const publicRoomObj = {
        code: this.currentRoomCode,
        hostName: playerName,
        difficulty,
        playerCount: 1,
        timestamp: Date.now()
      };
      try { localStorage.setItem('fruit_slice_recent_public_room', JSON.stringify(publicRoomObj)); } catch (e) {}
      fetch('/api/public-rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicRoomObj)
      }).catch(() => {});
    }

    // 2. Start Global Poller for cross-network state sync
    this.startStateSyncPoller();

    // 3. Initialize PeerJS Multi-STUN for P2P video mesh
    this.initPeerJS(`fruitslice-room-${this.currentRoomCode}`);
  }

  async joinRoom(roomCode) {
    this.disconnectPeer();

    this.currentRoomCode = roomCode.toUpperCase();
    this.isHost = false;
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
    this.myId = 'guest-' + Math.random().toString(36).substring(2, 7);

    const guestPlayer = {
      id: this.myId,
      name: playerName,
      isHost: false,
      ready: true,
      score: 0
    };

    this.roomState = {
      roomCode: this.currentRoomCode,
      isPublic: true,
      difficulty: 'medium',
      seeOthers: true,
      hostId: '',
      matchState: 'lobby',
      matchEndsAt: null,
      players: [guestPlayer]
    };

    this.mpUI.showLobby();
    this.mpUI.renderLobbyState(this.roomState, this.myId);

    // 1. Join room state on Vercel KV
    const serverState = await this.pushRoomStateToServer({
      action: 'join',
      player: guestPlayer
    });

    if (serverState) {
      this.roomState = serverState;
      this.onRoomStateChanged();
    }

    // 2. Start Global Poller for cross-network state sync
    this.startStateSyncPoller();

    // 3. Initialize PeerJS for WebRTC video mesh
    this.initPeerJS();
  }

  async pushRoomStateToServer(payload) {
    if (!this.currentRoomCode) return null;
    try {
      const res = await fetch(`/api/room-state?code=${this.currentRoomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: this.currentRoomCode, ...payload })
      });
      if (res.ok) {
        const data = await res.json();
        return data.state || null;
      }
    } catch (e) {
      console.warn('Room state sync API warning:', e);
    }
    return null;
  }

  startStateSyncPoller() {
    this.stopStateSyncPoller();

    const fetchLatestState = async () => {
      if (!this.currentRoomCode) return;
      try {
        const res = await fetch(`/api/room-state?code=${this.currentRoomCode}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.state) {
            const serverState = data.state;
            // Update local state from server
            if (JSON.stringify(serverState.players) !== JSON.stringify(this.roomState?.players) ||
                serverState.matchState !== this.roomState?.matchState ||
                serverState.seeOthers !== this.roomState?.seeOthers) {
              this.roomState = serverState;
              this.onRoomStateChanged();
            }
          }
        }
      } catch (e) {}
    };

    fetchLatestState();
    this.syncPollerInterval = setInterval(fetchLatestState, 1200);
  }

  stopStateSyncPoller() {
    if (this.syncPollerInterval) {
      clearInterval(this.syncPollerInterval);
      this.syncPollerInterval = null;
    }
  }

  sendScoreToHost(score) {
    const player = this.roomState?.players.find((p) => p.id === this.myId);
    if (player) {
      player.score = score;
    }

    this.pushRoomStateToServer({
      action: 'score-update',
      score,
      player: { id: this.myId }
    });
  }

  initPeerJS(customPeerId = null) {
    try {
      const peerOptions = {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun.services.mozilla.com' }
          ]
        }
      };

      this.peer = customPeerId ? new Peer(customPeerId, peerOptions) : new Peer(peerOptions);

      this.peer.on('call', (call) => {
        let localStream = null;
        if (this.game.camera && this.game.camera.video && this.game.camera.video.srcObject) {
          localStream = this.game.camera.video.srcObject;
        }
        call.answer(localStream);
        call.on('stream', (remoteStream) => {
          this.mpUI.attachRemoteVideoStream(call.peer, remoteStream);
        });
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS WebRTC video notice:', err);
      });
    } catch (e) {
      console.warn('PeerJS init notice:', e);
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
      this.appUI.hideAllModals();
      this.mpUI.hideAllMPModals();

      // Launch 60-second multiplayer match
      this.game.stopGame();
      this.game.startMultiplayerGame(difficulty, (newScore) => {
        this.sendScoreToHost(newScore);
      });

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
    this.stopStateSyncPoller();

    if (this.currentRoomCode && this.myId) {
      this.pushRoomStateToServer({
        action: 'leave',
        player: { id: this.myId }
      });
    }

    for (const [peerId, call] of this.mediaCalls) {
      try { call.close(); } catch (e) {}
    }
    this.mediaCalls.clear();

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
