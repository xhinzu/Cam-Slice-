/**
 * Multiplayer UI Manager - Controls Multiplayer submenus, Create/Join modals,
 * Lobby view, PC POV video sidebar, match timer HUD, and results screen.
 */

export class MultiplayerUIManager {
  constructor() {
    // Modals
    this.mpModal = document.getElementById('mp-modal');
    this.mpLobbyModal = document.getElementById('mp-lobby-modal');
    this.mpResultsModal = document.getElementById('mp-results-modal');

    // Submenu Views inside mpModal
    this.mpSubmenuView = document.getElementById('mp-submenu-view');
    this.mpCreateView = document.getElementById('mp-create-view');
    this.mpJoinView = document.getElementById('mp-join-view');

    // Submenu Buttons
    this.mpSubmenuCreateBtn = document.getElementById('mp-submenu-create-btn');
    this.mpSubmenuJoinBtn = document.getElementById('mp-submenu-join-btn');
    this.mpBackToMainMenuBtn = document.getElementById('mp-back-to-main-btn');

    // Create Room Elements
    this.mpRoomVisibilityToggle = document.getElementById('mp-visibility-toggle');
    this.mpCreateDiffBtns = document.querySelectorAll('.mp-diff-btn');
    this.mpConfirmCreateBtn = document.getElementById('mp-confirm-create-btn');
    this.mpCreateBackBtn = document.getElementById('mp-create-back-btn');
    this.selectedDiff = 'medium';

    // Join Room Elements
    this.mpPublicRoomsList = document.getElementById('mp-public-rooms-list');
    this.mpCodeInput = document.getElementById('mp-code-input');
    this.mpJoinByCodeBtn = document.getElementById('mp-join-by-code-btn');
    this.mpJoinBackBtn = document.getElementById('mp-join-back-btn');
    this.mpRefreshPublicBtn = document.getElementById('mp-refresh-public-btn');

    // Lobby Elements
    this.mpLobbyCodeEl = document.getElementById('mp-lobby-code');
    this.mpCopyCodeBtn = document.getElementById('mp-copy-code-btn');
    this.mpCopyLinkBtn = document.getElementById('mp-copy-link-btn');
    this.mpLobbyBadgeEl = document.getElementById('mp-lobby-badge');
    this.mpLobbyDiffEl = document.getElementById('mp-lobby-diff');
    this.mpLobbyPlayerList = document.getElementById('mp-lobby-player-list');
    this.mpHostControls = document.getElementById('mp-host-controls');
    this.mpSeeOthersToggle = document.getElementById('mp-see-others-toggle');
    this.mpStartMatchBtn = document.getElementById('mp-start-match-btn');
    this.mpToggleReadyBtn = document.getElementById('mp-toggle-ready-btn');
    this.mpLeaveLobbyBtn = document.getElementById('mp-leave-lobby-btn');
    this.mpLobbyNotice = document.getElementById('mp-lobby-notice');

    // Match Sidebar POV & Timer
    this.mpSidebarPOV = document.getElementById('mp-sidebar-pov');
    this.mpSidebarContent = document.getElementById('mp-sidebar-content');
    this.mpTimerHUD = document.getElementById('mp-timer-hud');
    this.mpTimerValue = document.getElementById('mp-timer-value');

    // Results Modal Elements
    this.mpResultsList = document.getElementById('mp-results-list');
    this.mpPlayAgainBtn = document.getElementById('mp-play-again-btn');
    this.mpResultsMenuBtn = document.getElementById('mp-results-menu-btn');
  }

  showSubmenu() {
    this.hideAllMPModals();
    this.mpModal.classList.remove('hidden');
    this.mpSubmenuView.classList.remove('hidden');
    this.mpCreateView.classList.add('hidden');
    this.mpJoinView.classList.add('hidden');
  }

  showCreateView() {
    this.mpSubmenuView.classList.add('hidden');
    this.mpJoinView.classList.add('hidden');
    this.mpCreateView.classList.remove('hidden');
  }

  showJoinView() {
    this.mpSubmenuView.classList.add('hidden');
    this.mpCreateView.classList.add('hidden');
    this.mpJoinView.classList.remove('hidden');
  }

  showLobby() {
    this.hideAllMPModals();
    this.mpLobbyModal.classList.remove('hidden');
  }

  showResults() {
    this.hideAllMPModals();
    this.hideSidebarPOV();
    this.hideTimerHUD();
    this.mpResultsModal.classList.remove('hidden');
  }

  hideAllMPModals() {
    if (this.mpModal) this.mpModal.classList.add('hidden');
    if (this.mpLobbyModal) this.mpLobbyModal.classList.add('hidden');
    if (this.mpResultsModal) this.mpResultsModal.classList.add('hidden');
  }

  renderLobbyState(state, currentUserId) {
    if (!state) return;

    // Room Code & Badges
    if (this.mpLobbyCodeEl) this.mpLobbyCodeEl.textContent = state.roomCode;
    if (this.mpLobbyBadgeEl) {
      this.mpLobbyBadgeEl.textContent = state.isPublic ? '🌐 PUBLIC ROOM' : '🔒 PRIVATE ROOM';
      this.mpLobbyBadgeEl.className = `room-badge ${state.isPublic ? 'public' : 'private'}`;
    }
    if (this.mpLobbyDiffEl) {
      this.mpLobbyDiffEl.textContent = state.difficulty.toUpperCase();
    }

    const isHost = state.hostId === currentUserId;

    // Host vs Non-Host Controls
    if (isHost) {
      this.mpHostControls.classList.remove('hidden');
      if (this.mpToggleReadyBtn) this.mpToggleReadyBtn.classList.add('hidden');
      if (this.mpSeeOthersToggle) this.mpSeeOthersToggle.checked = state.seeOthers;

      const playerLength = state.players ? state.players.length : 0;
      if (playerLength >= 1) {
        this.mpStartMatchBtn.disabled = false;
        this.mpStartMatchBtn.textContent = '🚀 START MATCH';
      } else {
        this.mpStartMatchBtn.disabled = true;
        this.mpStartMatchBtn.textContent = '⏳ Waiting for Players...';
      }
    } else {
      this.mpHostControls.classList.add('hidden');
      if (this.mpToggleReadyBtn) this.mpToggleReadyBtn.classList.remove('hidden');
    }

    // Player List
    if (this.mpLobbyPlayerList && state.players) {
      this.mpLobbyPlayerList.innerHTML = state.players.map((p) => {
        const isMe = p.id === currentUserId;
        return `
          <div class="lobby-player-card ${isMe ? 'is-me' : ''}">
            <div class="player-avatar">🥷</div>
            <div class="player-info">
              <div class="player-name">${this.escapeHTML(p.name)} ${isMe ? '(You)' : ''}</div>
              <div class="player-tags">
                ${p.isHost ? '<span class="tag host-tag">👑 HOST</span>' : ''}
                ${p.ready ? '<span class="tag ready-tag">READY ✓</span>' : '<span class="tag waiting-tag">WAITING...</span>'}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  renderPublicRooms(roomsList, onJoinClick) {
    if (!this.mpPublicRoomsList) return;

    if (!roomsList || roomsList.length === 0) {
      this.mpPublicRoomsList.innerHTML = `
        <div class="empty-rooms-notice">
          <span>No public rooms active right now.</span>
          <p>Create a public room to start playing with others!</p>
        </div>
      `;
      return;
    }

    this.mpPublicRoomsList.innerHTML = roomsList.map((room) => `
      <div class="public-room-item glass-panel">
        <div class="room-item-info">
          <div class="room-item-title">Room ${this.escapeHTML(room.code)}</div>
          <div class="room-item-sub">Host: ${this.escapeHTML(room.hostName)} | ${room.difficulty.toUpperCase()}</div>
        </div>
        <div class="room-item-right">
          <span class="player-count-badge">${room.playerCount}/4 Players</span>
          <button class="btn btn-primary btn-sm join-room-item-btn" data-room-code="${room.code}" ${room.playerCount >= 4 ? 'disabled' : ''}>
            ${room.playerCount >= 4 ? 'Full' : 'Join ➔'}
          </button>
        </div>
      </div>
    `).join('');

    // Bind Join buttons
    const joinBtns = this.mpPublicRoomsList.querySelectorAll('.join-room-item-btn');
    joinBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.roomCode;
        if (code && onJoinClick) onJoinClick(code);
      });
    });
  }

  /**
   * Render or update PC POV Sidebar overlay during match.
   */
  renderSidebarPOV(players, currentUserId, seeOthers, isPC) {
    if (!isPC) {
      this.hideSidebarPOV();
      return;
    }

    if (!this.mpSidebarPOV || !players) return;

    this.mpSidebarPOV.classList.remove('hidden');

    const otherPlayers = players.filter((p) => p.id !== currentUserId);

    if (!seeOthers) {
      // "See Others" OFF: Render compact text list
      this.mpSidebarContent.className = 'sidebar-text-list';
      this.mpSidebarContent.innerHTML = `
        <div class="sidebar-header">👥 Live Match Scores</div>
        ${otherPlayers.map((p) => `
          <div class="sidebar-player-row glass-panel">
            <span class="player-name">${this.escapeHTML(p.name)}</span>
            <span class="player-score">${p.score} 🍉</span>
          </div>
        `).join('')}
      `;
    } else {
      // "See Others" ON: Render video mesh tiles
      this.mpSidebarContent.className = 'sidebar-video-grid';
      otherPlayers.forEach((p) => {
        let tile = document.getElementById(`pov-tile-${p.id}`);
        if (!tile) {
          tile = document.createElement('div');
          tile.id = `pov-tile-${p.id}`;
          tile.className = 'pov-video-tile glass-panel';
          tile.innerHTML = `
            <div class="pov-video-wrapper">
              <video id="remote-video-${p.id}" autoplay playsinline muted></video>
              <div id="no-cam-${p.id}" class="no-cam-overlay hidden">📷 Camera Unavailable</div>
            </div>
            <div class="pov-tile-footer">
              <span class="pov-player-name">${this.escapeHTML(p.name)}</span>
              <span id="pov-score-${p.id}" class="pov-score-badge">${p.score} 🍉</span>
            </div>
          `;
          this.mpSidebarContent.appendChild(tile);
        } else {
          // Update score badge
          const scoreEl = document.getElementById(`pov-score-${p.id}`);
          if (scoreEl) scoreEl.textContent = `${p.score} 🍉`;
        }
      });

      // Remove tiles of players who left
      const existingTiles = this.mpSidebarContent.querySelectorAll('.pov-video-tile');
      existingTiles.forEach((tile) => {
        const id = tile.id.replace('pov-tile-', '');
        if (!otherPlayers.some((p) => p.id === id)) {
          tile.remove();
        }
      });
    }
  }

  attachRemoteVideoStream(peerId, stream) {
    const videoEl = document.getElementById(`remote-video-${peerId}`);
    const noCamEl = document.getElementById(`no-cam-${peerId}`);
    if (videoEl) {
      videoEl.srcObject = stream;
      if (noCamEl) noCamEl.classList.add('hidden');
    }
  }

  showRemoteCameraUnavailable(peerId) {
    const noCamEl = document.getElementById(`no-cam-${peerId}`);
    if (noCamEl) noCamEl.classList.remove('hidden');
  }

  hideSidebarPOV() {
    if (this.mpSidebarPOV) {
      this.mpSidebarPOV.classList.add('hidden');
      if (this.mpSidebarContent) this.mpSidebarContent.innerHTML = '';
    }
  }

  showTimerHUD(secondsRemaining) {
    if (this.mpTimerHUD) {
      this.mpTimerHUD.classList.remove('hidden');
      this.updateTimerHUD(secondsRemaining);
    }
  }

  updateTimerHUD(secondsRemaining) {
    if (this.mpTimerValue) {
      const mins = Math.floor(secondsRemaining / 60);
      const secs = secondsRemaining % 60;
      this.mpTimerValue.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  }

  hideTimerHUD() {
    if (this.mpTimerHUD) this.mpTimerHUD.classList.add('hidden');
  }

  renderResults(players, isHost) {
    if (!this.mpResultsList || !players) return;

    // Sort players by score descending
    const sorted = [...players].sort((a, b) => b.score - a.score);

    this.mpResultsList.innerHTML = sorted.map((p, idx) => {
      const rank = idx + 1;
      const isWinner = rank === 1;
      return `
        <div class="result-row glass-panel ${isWinner ? 'winner-row' : ''}">
          <div class="rank-badge">${isWinner ? '👑 #1' : `#${rank}`}</div>
          <div class="result-player-name">${this.escapeHTML(p.name)}</div>
          <div class="result-score">${p.score} 🍉</div>
        </div>
      `;
    }).join('');

    if (isHost) {
      this.mpPlayAgainBtn.classList.remove('hidden');
    } else {
      this.mpPlayAgainBtn.classList.add('hidden');
    }
  }

  escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}
