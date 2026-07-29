/**
 * Multiplayer Manager - Cross-Network Real-Time Multiplayer powered by
 * Vercel KV State Synchronization & WebRTC Multi-STUN Video Mesh.
 */

import { Peer } from 'peerjs';
import { WebRTCManager } from './webrtc.js';
import { MultiplayerUIManager } from './multiplayerUI.js';
import { VoiceChatManager } from './voiceChat.js';

export const MAX_ROOM_PLAYERS = 12;
export const MAX_VIDEO_TILES = 4;

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

    this.voiceEnabled = true;
    this.voiceChat = new VoiceChatManager({
      onSpeakingChange: (isSpeaking) => this.onLocalSpeakingChanged(isSpeaking),
      onMicStateChange: (isMuted) => {
        this.mpUI.updateMicUI(isMuted, this.voiceEnabled);
        this.onLocalMicStateChanged(isMuted);
      }
    });

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
      const difficulty = this.mpUI.selectedDiff || 'medium';
      const mode = this.mpUI.selectedMode || 'fruit-slice';
      const roomCode = this.generateRoomCode();
      this.createAndJoinRoom(roomCode, isPublic, difficulty, mode);
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

    // Mic Mute Buttons (Lobby & HUD Overlay)
    if (this.mpUI.mpLobbyMicBtn) {
      this.mpUI.mpLobbyMicBtn.addEventListener('click', () => {
        if (this.voiceChat) this.voiceChat.toggleMute();
      });
    }
    if (this.mpUI.hudMicBtn) {
      this.mpUI.hudMicBtn.addEventListener('click', () => {
        if (this.voiceChat) this.voiceChat.toggleMute();
      });
    }

    // Check URL parameters for direct invite join on app boot
    this.checkURLJoin();
  }

  updatePeerAudioTracks() {
    const audioTrack = this.voiceChat ? this.voiceChat.getAudioTrack() : null;
    if (!audioTrack) return;

    for (const [peerId, call] of this.mediaCalls) {
      if (call && call.peerConnection) {
        try {
          const senders = call.peerConnection.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch(() => {});
          } else {
            call.peerConnection.addTrack(audioTrack, new MediaStream([audioTrack]));
          }
        } catch (e) {}
      }
    }
  }

  onLocalSpeakingChanged(isSpeaking) {
    if (!this.roomState || !this.myId) return;
    const me = this.roomState.players?.find(p => p.id === this.myId);
    if (me && me.isSpeaking !== isSpeaking) {
      me.isSpeaking = isSpeaking;
      this.mpUI.renderLobbyPlayers(this.roomState, this.myId);
      this.pushRoomStateToServer({
        action: 'update-voice',
        player: { id: this.myId, isSpeaking, isMuted: Boolean(me.isMuted) }
      });
    }
  }

  onLocalMicStateChanged(isMuted) {
    if (this.voiceChat) {
      this.updatePeerAudioTracks();
    }
    if (!this.roomState || !this.myId) return;
    const me = this.roomState.players?.find(p => p.id === this.myId);
    if (me) {
      me.isMuted = isMuted;
      this.mpUI.renderLobbyPlayers(this.roomState, this.myId);
      this.pushRoomStateToServer({
        action: 'update-voice',
        player: { id: this.myId, isMuted, isSpeaking: Boolean(me.isSpeaking) }
      });
    }
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

  async createAndJoinRoom(roomCode, isPublic, difficulty, mode = 'fruit-slice') {
    this.disconnectPeer();

    this.currentRoomCode = roomCode.toUpperCase();
    this.isHost = true;
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
    this.myId = 'host-' + Math.random().toString(36).substring(2, 7);

    const voiceChatEnabled = this.mpUI.mpVoiceToggle ? this.mpUI.mpVoiceToggle.checked : true;
    this.voiceEnabled = voiceChatEnabled;

    if (voiceChatEnabled && this.voiceChat) {
      await this.voiceChat.startMicrophone();
    }

    const initialHostPlayer = {
      id: this.myId,
      name: playerName,
      isHost: true,
      ready: true,
      score: 0,
      voiceEnabled: voiceChatEnabled,
      isMuted: Boolean(this.voiceChat?.isMuted),
      isSpeaking: false
    };

    this.roomState = {
      roomCode: this.currentRoomCode,
      isPublic,
      difficulty,
      mode: mode || 'fruit-slice',
      seeOthers: true,
      voiceChat: voiceChatEnabled,
      hostId: this.myId,
      matchState: 'lobby',
      matchEndsAt: null,
      players: [initialHostPlayer]
    };

    this.mpUI.showLobby();
    this.mpUI.updateMicUI(this.voiceChat?.isMuted, voiceChatEnabled);
    this.mpUI.renderLobbyState(this.roomState, this.myId, this.isHost);

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
        voiceChat: voiceChatEnabled,
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

    this.voiceEnabled = true;
    if (this.voiceChat) {
      await this.voiceChat.startMicrophone();
    }

    const guestPlayer = {
      id: this.myId,
      name: playerName,
      isHost: false,
      ready: true,
      score: 0,
      voiceEnabled: true,
      isMuted: Boolean(this.voiceChat?.isMuted),
      isSpeaking: false
    };

    this.roomState = {
      roomCode: this.currentRoomCode,
      isPublic: true,
      difficulty: 'medium',
      seeOthers: true,
      voiceChat: true,
      hostId: '',
      matchState: 'lobby',
      matchEndsAt: null,
      players: [guestPlayer]
    };

    this.mpUI.showLobby();
    this.mpUI.updateMicUI(this.voiceChat?.isMuted, true);
    this.mpUI.renderLobbyState(this.roomState, this.myId, this.isHost);

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
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
    let player = this.roomState?.players.find((p) => p.id === this.myId);
    if (!player && this.roomState?.players) {
      player = this.roomState.players.find((p) => this.isHost ? p.isHost : p.name === playerName);
    }
    if (player) {
      player.score = score;
    }

    const now = performance.now();
    if (!this.lastScoreBroadcastTime || now - this.lastScoreBroadcastTime >= 100) {
      this.lastScoreBroadcastTime = now;
      this.pushRoomStateToServer({
        action: 'score-update',
        score,
        player: {
          id: this.myId,
          name: playerName,
          isHost: this.isHost
        }
      });
    }
  }

  startCamFrameRelay() {
    this.stopCamFrameRelay();

    if (!this.camCanvas) {
      this.camCanvas = document.createElement('canvas');
      this.camCanvas.width = 320;
      this.camCanvas.height = 240;
      this.camCtx = this.camCanvas.getContext('2d');
    }

    const captureAndPushFrame = async () => {
      if (!this.currentRoomCode || !this.myId || this.roomState?.matchState !== 'playing') return;
      const videoEl = this.game?.camera?.video;
      if (!videoEl || videoEl.readyState < 2) return;

      try {
        this.camCtx.drawImage(videoEl, 0, 0, 320, 240);
        const jpegData = this.camCanvas.toDataURL('image/jpeg', 0.4);

        fetch(`/api/cam-frame?code=${this.currentRoomCode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: this.currentRoomCode,
            peerId: this.myId,
            frame: jpegData
          })
        }).catch(() => {});
      } catch (e) {}
    };

    const fetchRemoteFrames = async () => {
      if (!this.currentRoomCode || this.roomState?.matchState !== 'playing') return;
      try {
        const res = await fetch(`/api/cam-frame?code=${this.currentRoomCode}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.frames) {
            Object.keys(data.frames).forEach((peerId) => {
              if (peerId !== this.myId && data.frames[peerId]?.frame) {
                this.mpUI.updateRemoteCameraFrame(peerId, data.frames[peerId].frame);
              }
            });
          }
        }
      } catch (e) {}
    };

    captureAndPushFrame();
    fetchRemoteFrames();

    this.camPushInterval = setInterval(captureAndPushFrame, 300);
    this.camFetchInterval = setInterval(fetchRemoteFrames, 300);
  }

  stopCamFrameRelay() {
    if (this.camPushInterval) {
      clearInterval(this.camPushInterval);
      this.camPushInterval = null;
    }
    if (this.camFetchInterval) {
      clearInterval(this.camFetchInterval);
      this.camFetchInterval = null;
    }
  }

  getLocalCameraStream() {
    if (this.game?.camera?.stream) {
      const tracks = this.game.camera.stream.getVideoTracks ? this.game.camera.stream.getVideoTracks() : [];
      if (tracks && tracks.length > 0) {
        return this.game.camera.stream;
      }
    }
    if (this.game?.camera?.video?.srcObject) {
      const srcStream = this.game.camera.video.srcObject;
      const tracks = srcStream.getVideoTracks ? srcStream.getVideoTracks() : [];
      if (tracks && tracks.length > 0) {
        return srcStream;
      }
    }
    return null;
  }

  getLocalCombinedStream() {
    const camStream = this.getLocalCameraStream();
    const audioTrack = this.voiceChat ? this.voiceChat.getAudioTrack() : null;

    const tracks = [];
    if (camStream) {
      camStream.getVideoTracks().forEach((t) => {
        try {
          tracks.push(t.clone());
        } catch (e) {
          tracks.push(t);
        }
      });
    }
    if (audioTrack) {
      try {
        tracks.push(audioTrack.clone());
      } catch (e) {
        tracks.push(audioTrack);
      }
    }

    return tracks.length > 0 ? new MediaStream(tracks) : null;
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
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun.services.mozilla.com' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelay',
              credential: 'openrelay'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelay',
              credential: 'openrelay'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelay',
              credential: 'openrelay'
            }
          ]
        }
      };

      this.peer = customPeerId ? new Peer(customPeerId, peerOptions) : new Peer(peerOptions);

      this.peer.on('open', (assignedPeerId) => {
        const oldId = this.myId;
        this.myId = assignedPeerId;

        if (this.roomState) {
          if (this.isHost) {
            this.roomState.hostId = assignedPeerId;
          }
          if (this.roomState.players) {
            const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';
            const me = this.roomState.players.find(p => p.id === oldId || (this.isHost ? p.isHost : !p.isHost && p.name === playerName));
            if (me) {
              me.id = assignedPeerId;
              if (this.isHost) me.isHost = true;
            }
          }
          this.pushRoomStateToServer({ action: 'update', state: this.roomState });
        }

        // Auto call existing peers if seeOthers is active
        if (this.roomState && this.roomState.seeOthers && this.roomState.matchState === 'playing') {
          this.roomState.players.forEach(p => {
            if (p.id !== assignedPeerId && p.id !== 'connecting') {
              this.callPeerVideo(p.id);
            }
          });
        }
      });

      this.peer.on('call', (call) => {
        const localStream = this.getLocalCombinedStream();
        call.answer(localStream);
        call.on('stream', (remoteStream) => {
          this.mpUI.attachRemoteVideoStream(call.peer, remoteStream);
          if (this.voiceChat) {
            this.voiceChat.attachRemoteAudioStream(call.peer, remoteStream);
          }
        });
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS WebRTC video notice:', err);
      });
    } catch (e) {
      console.warn('PeerJS init notice:', e);
    }
  }

  callPeerVideo(targetPeerId) {
    if (!this.peer || !targetPeerId || targetPeerId === this.myId || targetPeerId === 'connecting') return;

    const existingCall = this.mediaCalls.get(targetPeerId);
    if (existingCall && existingCall.open) return;

    if (existingCall) {
      try { existingCall.close(); } catch (e) {}
      this.mediaCalls.delete(targetPeerId);
    }

    const localStream = this.getLocalCombinedStream();

    try {
      const call = this.peer.call(targetPeerId, localStream);
      if (call) {
        this.mediaCalls.set(targetPeerId, call);
        call.on('stream', (remoteStream) => {
          this.mpUI.attachRemoteVideoStream(targetPeerId, remoteStream);
          if (this.voiceChat) {
            this.voiceChat.attachRemoteAudioStream(targetPeerId, remoteStream);
          }
        });
        call.on('close', () => {
          this.mediaCalls.delete(targetPeerId);
          if (this.voiceChat) {
            this.voiceChat.removeRemoteAudio(targetPeerId);
          }
        });
        call.on('error', () => {
          this.mediaCalls.delete(targetPeerId);
          if (this.voiceChat) {
            this.voiceChat.removeRemoteAudio(targetPeerId);
          }
        });
      }
    } catch (e) {
      console.warn('Call peer video error:', e);
    }
  }

  onRoomStateChanged() {
    if (!this.roomState) return;

    const { matchState, players, seeOthers, difficulty, matchEndsAt } = this.roomState;

    // Prevent transient lobby popups during active gameplay
    if (this.activeMatchState === 'playing' && matchState === 'lobby') {
      if (players) {
        this.mpUI.renderSidebarPOV(players, this.myId, seeOthers);
      }
      return;
    }

    if (matchState === 'lobby') {
      if (this.activeMatchState !== 'lobby') {
        this.activeMatchState = 'lobby';
        this.game.stopGame();
        this.mpUI.hideSidebarPOV();
        this.mpUI.hideTimerHUD();
        this.stopMatchTimer();
        this.stopCamFrameRelay();
      }
      this.mpUI.showLobby();
      this.mpUI.renderLobbyState(this.roomState, this.myId, this.isHost);

    } else if (matchState === 'playing') {
      this.appUI.hideAllModals();
      this.mpUI.hideAllMPModals();

      // Launch 60-second multiplayer match ONLY ONCE when entering playing state
      if (this.activeMatchState !== 'playing') {
        this.activeMatchState = 'playing';
        this.game.stopGame();
        const mode = this.roomState.mode || 'fruit-slice';
        this.game.startMultiplayerGame(difficulty, mode, (newScore) => {
          this.sendScoreToHost(newScore);
        });
        if (matchEndsAt) {
          this.startMatchTimer(matchEndsAt);
        }
      }

      // Start Camera Frame Relay
      this.startCamFrameRelay();

      // Initiate WebRTC video calls if seeOthers is enabled (MAX 4 video tiles cap)
      if (seeOthers && players) {
        // Selection rule: Pick up to MAX_VIDEO_TILES (4) remote players by room join order
        const otherRemotePlayers = players.filter(p => p.id !== this.myId && p.id !== 'connecting');
        const videoEligiblePeers = otherRemotePlayers.slice(0, MAX_VIDEO_TILES);
        videoEligiblePeers.forEach(p => {
          this.callPeerVideo(p.id);
        });
      }

      // Update Live Sidebar POV overlay and live score badges in real-time
      this.mpUI.renderSidebarPOV(players, this.myId, seeOthers);

    } else if (matchState === 'ended') {
      if (this.activeMatchState !== 'ended') {
        this.activeMatchState = 'ended';
        this.game.stopGame();
        this.stopMatchTimer();
        this.stopCamFrameRelay();

        const isHost = this.roomState.hostId === this.myId || this.isHost;
        this.mpUI.renderResults(players, isHost);
        this.mpUI.showResults();
      }
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
        this.activeMatchState = 'ended';
        this.game.stopGame();
        this.stopCamFrameRelay();

        if (this.roomState) {
          this.roomState.matchState = 'ended';
          if (this.isHost) {
            this.pushRoomStateToServer({ action: 'update', matchState: 'ended' });
          }
          const isHostFlag = this.roomState.hostId === this.myId || this.isHost;
          this.mpUI.renderResults(this.roomState.players, isHostFlag);
          this.mpUI.showResults();
        }
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
    this.stopCamFrameRelay();

    if (this.voiceChat) {
      this.voiceChat.stopMicrophone();
    }

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
    this.activeMatchState = null;
  }
}
