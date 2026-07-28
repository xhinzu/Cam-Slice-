/**
 * Multiplayer Manager - PartySocket Room Connection, State Synchronization,
 * WebRTC Mesh Orchestration, and Match Loop Integration.
 */

import PartySocket from 'partysocket';
import { WebRTCManager } from './webrtc.js';
import { MultiplayerUIManager } from './multiplayerUI.js';

export class MultiplayerManager {
  constructor(gameManager, uiManager) {
    this.game = gameManager;
    this.appUI = uiManager;

    this.mpUI = new MultiplayerUIManager();
    this.webrtc = null;
    this.socket = null;

    this.currentRoomCode = null;
    this.myId = null;
    this.roomState = null;
    this.timerInterval = null;

    this.isPC = WebRTCManager.isSupportedOnDevice();

    this.initEvents();
  }

  getPartyHost() {
    if (import.meta.env?.VITE_PARTYKIT_HOST) {
      return import.meta.env.VITE_PARTYKIT_HOST;
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return '127.0.0.1:1999';
    }
    return window.location.host;
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
      const code = this.currentRoomCode || (this.roomState ? this.roomState.roomCode : '');
      this.copyTextToClipboard(code, this.mpUI.mpCopyCodeBtn, 'Copied! ✓', '📋 Copy Code');
    });

    this.mpUI.mpCopyLinkBtn.addEventListener('click', () => {
      const code = this.currentRoomCode || (this.roomState ? this.roomState.roomCode : '');
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      this.copyTextToClipboard(url, this.mpUI.mpCopyLinkBtn, 'Link Copied! ✓', '🔗 Copy Share Link');
    });

    // Host Controls: See Others Toggle
    if (this.mpUI.mpSeeOthersToggle) {
      this.mpUI.mpSeeOthersToggle.addEventListener('change', (e) => {
        if (this.roomState) {
          this.roomState.seeOthers = e.target.checked;
        }
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(
            JSON.stringify({
              type: 'set-see-others',
              seeOthers: e.target.checked
            })
          );
        }
      });
    }

    // Host Controls: Start Match
    if (this.mpUI.mpStartMatchBtn) {
      this.mpUI.mpStartMatchBtn.addEventListener('click', () => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'start-match' }));
        } else if (this.roomState) {
          // Immediate local start fallback
          this.roomState.matchState = 'playing';
          this.roomState.matchEndsAt = Date.now() + 60000;
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
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'restart-lobby' }));
        } else if (this.roomState) {
          this.roomState.matchState = 'lobby';
          this.roomState.matchEndsAt = null;
          this.roomState.players.forEach((p) => {
            p.score = 0;
            p.ready = p.isHost;
          });
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
      // Auto open multiplayer join
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
    this.currentRoomCode = roomCode;
    this.myId = 'host-' + Math.random().toString(36).substring(2, 7);
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';

    this.roomState = {
      roomCode,
      isPublic,
      difficulty,
      seeOthers: true,
      hostId: this.myId,
      matchState: 'lobby',
      matchEndsAt: null,
      players: [
        { id: this.myId, name: playerName, isHost: true, ready: true, score: 0 }
      ]
    };

    if (isPublic) {
      const publicRoomObj = {
        code: roomCode,
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

    this.mpUI.showLobby();
    this.mpUI.renderLobbyState(this.roomState, this.myId);

    // Connect to PartySocket in background
    this.connectToSocket(roomCode, () => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            type: 'create-room-config',
            isPublic,
            difficulty,
            seeOthers: true
          })
        );
      }
    });

    // Register with PartyKit global lobby socket if public
    if (isPublic) {
      try {
        const lobbySocket = new PartySocket({ host: this.getPartyHost(), room: 'lobby' });
        lobbySocket.addEventListener('open', () => {
          lobbySocket.send(JSON.stringify({
            type: 'register-public-room',
            code: roomCode,
            hostName: playerName,
            difficulty,
            playerCount: 1
          }));
          setTimeout(() => lobbySocket.close(), 1000);
        });
      } catch (e) {}
    }
  }

  joinRoom(roomCode) {
    this.currentRoomCode = roomCode;
    this.myId = 'guest-' + Math.random().toString(36).substring(2, 7);
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';

    this.roomState = {
      roomCode,
      isPublic: true,
      difficulty: 'medium',
      seeOthers: true,
      hostId: '',
      matchState: 'lobby',
      matchEndsAt: null,
      players: [
        { id: this.myId, name: playerName, isHost: false, ready: true, score: 0 }
      ]
    };

    this.mpUI.showLobby();
    this.mpUI.renderLobbyState(this.roomState, this.myId);

    this.connectToSocket(roomCode);
  }

  connectToSocket(roomCode, onOpenCallback) {
    this.leaveRoom(); // Clean up existing sockets/webRTC

    const partyHost = this.getPartyHost();
    const playerName = this.appUI.getPlayerName() || 'Ninja Slicer';

    this.socket = new PartySocket({
      host: partyHost,
      room: roomCode
    });

    // Initialize WebRTC Manager with signaling callback
    this.webrtc = new WebRTCManager({
      sendSignal: (targetId, signalData) => {
        if (this.socket) {
          this.socket.send(
            JSON.stringify({
              type: 'signal',
              targetId,
              signalData
            })
          );
        }
      },
      onRemoteStream: (peerId, stream) => {
        this.mpUI.attachRemoteVideoStream(peerId, stream);
      },
      onRemoteStreamEnded: (peerId) => {
        this.mpUI.showRemoteCameraUnavailable(peerId);
      }
    });

    if (this.game.camera && this.game.camera.video && this.game.camera.video.srcObject) {
      this.webrtc.setLocalStream(this.game.camera.video.srcObject);
    }

    this.socket.addEventListener('open', () => {
      this.socket.send(
        JSON.stringify({
          type: 'set-name',
          name: playerName
        })
      );

      if (onOpenCallback) onOpenCallback();
    });

    this.socket.addEventListener('message', (event) => {
      this.handleSocketMessage(event.data);
    });

    this.socket.addEventListener('close', () => {
      console.log('Multiplayer PartySocket closed');
    });
  }

  handleSocketMessage(rawMsg) {
    let msg;
    try {
      msg = JSON.parse(rawMsg);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'init': {
        this.myId = msg.yourId;
        this.roomState = msg.state;
        this.mpUI.showLobby();
        this.mpUI.renderLobbyState(this.roomState, this.myId);
        break;
      }

      case 'error': {
        alert(msg.message || 'Room Error');
        this.leaveRoom();
        this.mpUI.showSubmenu();
        break;
      }

      case 'state-update': {
        this.roomState = msg.state;
        this.onRoomStateChanged();
        break;
      }

      case 'host-disconnected': {
        alert(msg.message || 'Host disconnected');
        this.leaveRoom();
        this.game.stopGame();
        this.mpUI.hideAllMPModals();
        this.mpUI.hideSidebarPOV();
        this.mpUI.hideTimerHUD();
        this.appUI.showMainMenu(this.game.currentLevel);
        break;
      }

      case 'signal': {
        if (this.webrtc && this.isPC && this.roomState?.seeOthers) {
          this.webrtc.handleSignal(msg.senderId, msg.signalData);
        }
        break;
      }
    }
  }

  onRoomStateChanged() {
    if (!this.roomState) return;

    const { matchState, players, seeOthers, difficulty, matchEndsAt } = this.roomState;

    if (matchState === 'lobby') {
      this.game.stopGame();
      this.mpUI.hideSidebarPOV();
      this.mpUI.hideTimerHUD();
      if (this.webrtc) this.webrtc.closeAll();

      this.mpUI.showLobby();
      this.mpUI.renderLobbyState(this.roomState, this.myId);
    } else if (matchState === 'playing') {
      this.mpUI.hideAllMPModals();

      // Start local gameplay loop in multiplayer mode
      if (!this.game.isPlaying) {
        this.game.startMultiplayerGame(difficulty, (newScore) => {
          if (this.socket) {
            this.socket.send(
              JSON.stringify({
                type: 'score-update',
                score: newScore
              })
            );
          }
        });
      }

      // Sync WebRTC Mesh if PC & seeOthers ON
      if (this.isPC && seeOthers) {
        const peerIds = players.map((p) => p.id);
        this.webrtc.syncMeshPeers(this.myId, peerIds);
      } else if (this.webrtc) {
        this.webrtc.closeAll();
      }

      // Render PC Sidebar POV overlay
      this.mpUI.renderSidebarPOV(players, this.myId, seeOthers, this.isPC);

      // Start authoritative Match Timer
      this.startMatchTimer(matchEndsAt);
    } else if (matchState === 'ended') {
      this.game.stopGame();
      this.stopMatchTimer();

      const isHost = this.roomState.hostId === this.myId;
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

  leaveRoom() {
    this.stopMatchTimer();
    if (this.webrtc) {
      this.webrtc.closeAll();
      this.webrtc = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.currentRoomCode = null;
    this.roomState = null;
    this.myId = null;
  }
}
