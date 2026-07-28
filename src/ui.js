/**
 * UI Module - Controls modal dialogs, HUD elements, Leaderboard rendering,
 * and player preference management.
 */

export class UIManager {
  constructor() {
    // Modals
    this.loadingModal = document.getElementById('loading-modal');
    this.loadingStatus = document.getElementById('loading-status');
    this.nameModal = document.getElementById('name-modal');
    this.tutorialModal = document.getElementById('tutorial-modal');
    this.menuModal = document.getElementById('menu-modal');
    this.levelModal = document.getElementById('level-modal');
    this.quitModal = document.getElementById('quit-modal');
    this.gameoverModal = document.getElementById('gameover-modal');
    this.cameraErrorModal = document.getElementById('camera-error-modal');
    this.userProfileModal = document.getElementById('user-profile-modal');
    this.storeModal = document.getElementById('store-modal');

    // HUD Elements
    this.hudLayer = document.getElementById('hud-layer');
    this.currentScoreEl = document.getElementById('current-score');
    this.comboBadgeEl = document.getElementById('combo-display');
    this.levelBadgeEl = document.getElementById('level-badge');
    this.livesContainer = document.getElementById('lives-display');
    this.hudLeaderboard = document.getElementById('hud-leaderboard');
    this.toggleLBBtn = document.getElementById('toggle-lb-btn');
    this.leaderboardListEl = document.getElementById('leaderboard-list');
    this.screenFlashEl = document.getElementById('screen-flash');
    this.scoreLabelEl = document.getElementById('score-label');

    // Main Menu Buttons & Tags
    this.menuPlayBtn = document.getElementById('menu-play-btn');
    this.menuMPBtn = document.getElementById('menu-mp-btn');
    this.menuModesBtn = document.getElementById('menu-modes-btn');
    this.menuTutorialBtn = document.getElementById('menu-tutorial-btn');
    this.menuQuitBtn = document.getElementById('menu-quit-btn');
    this.menuPlayerName = document.getElementById('menu-player-name');
    this.menuEditNameBtn = document.getElementById('menu-edit-name-btn');
    this.menuSelectedModeTag = document.getElementById('menu-selected-mode-tag');
    this.backToMenuBtn = document.getElementById('back-to-menu-btn');
    this.quitReturnBtn = document.getElementById('quit-return-btn');

    // Mode & Level Cards
    this.modeCards = document.querySelectorAll('.mode-card');
    this.lbTabs = document.querySelectorAll('.lb-tab');
    this.levelBtns = document.querySelectorAll('.level-btn');

    // Form inputs & button refs
    this.nameForm = document.getElementById('name-form');
    this.nameInput = document.getElementById('player-name-input');
    this.slicerNameTag = document.getElementById('slicer-name-tag');
    this.understandBtn = document.getElementById('understand-btn');
    this.viewTutorialBtn = document.getElementById('view-tutorial-btn');
    this.startGameBtn = document.getElementById('start-game-btn');
    this.changeNameBtn = document.getElementById('change-name-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.changeLevelBtn = document.getElementById('change-level-btn');
    this.retryCameraBtn = document.getElementById('retry-camera-btn');

    // Game Over display refs
    this.finalScoreEl = document.getElementById('final-score');
    this.bestScoreEl = document.getElementById('best-score');
    this.highscoreBadgeEl = document.getElementById('highscore-badge');

    this.playerNameKey = 'fruit_slice_player_name';
  }

  setModeActive(mode) {
    if (this.modeCards) {
      this.modeCards.forEach(card => {
        if (card.dataset.mode === mode) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }
    if (this.scoreLabelEl) {
      this.scoreLabelEl.textContent = mode === 'punch-glass' ? 'PANES BROKEN' : 'FRUITS SLICED';
    }
  }

  setLBTabActive(mode) {
    if (this.lbTabs) {
      this.lbTabs.forEach(tab => {
        if (tab.dataset.lbMode === mode) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
    }
  }

  toggleLeaderboard() {
    if (!this.hudLeaderboard) return;
    const isCollapsed = this.hudLeaderboard.classList.toggle('collapsed');
    if (this.toggleLBBtn) {
      this.toggleLBBtn.textContent = isCollapsed ? '🙈' : '👁️';
      this.toggleLBBtn.title = isCollapsed ? 'Show Leaderboard' : 'Hide Leaderboard';
    }
  }

  getPlayerName() {
    return localStorage.getItem(this.playerNameKey) || '';
  }

  setPlayerName(name) {
    const clean = (name || '').trim().substring(0, 15);
    localStorage.setItem(this.playerNameKey, clean);
    return clean;
  }

  showLoading(msg) {
    this.hideAllModals();
    if (this.loadingStatus) this.loadingStatus.textContent = msg;
    this.loadingModal.classList.remove('hidden');
  }

  showNameEntry() {
    this.hideAllModals();
    const saved = this.getPlayerName();
    if (saved) {
      this.nameInput.value = saved;
    }
    this.nameModal.classList.remove('hidden');
  }

  showMainMenu(currentLevel = 'medium') {
    this.hideAllModals();
    const name = this.getPlayerName() || 'Slicer';
    if (this.menuPlayerName) this.menuPlayerName.textContent = name;
    if (this.menuSelectedModeTag) this.menuSelectedModeTag.textContent = currentLevel.toUpperCase();
    if (this.menuModal) this.menuModal.classList.remove('hidden');
  }

  showQuit() {
    this.hideAllModals();
    if (this.quitModal) this.quitModal.classList.remove('hidden');
  }

  showTutorial() {
    this.hideAllModals();
    if (this.tutorialModal) {
      this.tutorialModal.classList.remove('hidden');
    }
  }

  showLevelSelect(currentLevel = 'medium') {
    this.hideAllModals();
    const name = this.getPlayerName() || 'Slicer';
    if (this.slicerNameTag) this.slicerNameTag.textContent = name;
    
    this.setLevelActive(currentLevel);
    this.levelModal.classList.remove('hidden');
  }

  setLevelActive(level) {
    this.levelBtns.forEach(btn => {
      if (btn.dataset.level === level) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    if (this.menuSelectedModeTag) {
      this.menuSelectedModeTag.textContent = level.toUpperCase();
    }
  }

  showGameOver(score, bestScore, isNewHighScore) {
    this.hideAllModals();
    this.finalScoreEl.textContent = score;
    this.bestScoreEl.textContent = bestScore;

    if (isNewHighScore) {
      this.highscoreBadgeEl.classList.remove('hidden');
    } else {
      this.highscoreBadgeEl.classList.add('hidden');
    }

    this.gameoverModal.classList.remove('hidden');
  }

  showCameraError() {
    this.hideAllModals();
    this.cameraErrorModal.classList.remove('hidden');
  }

  hideAllModals() {
    this.loadingModal.classList.add('hidden');
    this.nameModal.classList.add('hidden');
    if (this.tutorialModal) this.tutorialModal.classList.add('hidden');
    if (this.menuModal) this.menuModal.classList.add('hidden');
    this.levelModal.classList.add('hidden');
    if (this.quitModal) this.quitModal.classList.add('hidden');
    this.gameoverModal.classList.add('hidden');
    this.cameraErrorModal.classList.add('hidden');
    if (this.userProfileModal) this.userProfileModal.classList.add('hidden');
    if (this.storeModal) this.storeModal.classList.add('hidden');
  }

  showUserProfile() {
    this.hideAllModals();
    if (this.userProfileModal) {
      this.userProfileModal.classList.remove('hidden');
    }
  }

  showStore() {
    this.hideAllModals();
    if (this.storeModal) {
      this.storeModal.classList.remove('hidden');
    }
  }

  setHUDVisible(visible) {
    if (visible) {
      this.hudLayer.classList.remove('hidden');
    } else {
      this.hudLayer.classList.add('hidden');
    }
  }

  updateHUDScore(score) {
    this.currentScoreEl.textContent = score;
  }

  showCombo(count) {
    this.comboBadgeEl.textContent = `COMBO x${count}!`;
    this.comboBadgeEl.classList.remove('hidden');
    setTimeout(() => {
      this.comboBadgeEl.classList.add('hidden');
    }, 1200);
  }

  updateHUDLives(remainingLives, isFreestyle = false) {
    if (!this.livesContainer) return;
    if (isFreestyle || remainingLives >= 900) {
      this.livesContainer.innerHTML = '<span class="freestyle-hud-tag">♾️ UNLIMITED</span>';
      return;
    }

    this.livesContainer.innerHTML = `
      <span class="heart active">❤️</span>
      <span class="heart active">❤️</span>
      <span class="heart active">❤️</span>
    `;

    const hearts = this.livesContainer.querySelectorAll('.heart');
    hearts.forEach((heart, idx) => {
      if (idx < remainingLives) {
        heart.classList.add('active');
      } else {
        heart.classList.remove('active');
      }
    });
  }

  updateLevelBadge(level) {
    this.levelBadgeEl.textContent = level.toUpperCase();
  }

  triggerScreenFlash() {
    this.screenFlashEl.classList.add('active');
    setTimeout(() => {
      this.screenFlashEl.classList.remove('active');
    }, 250);
  }

  renderLeaderboard(scoresList, activePlayerName = '') {
    if (!scoresList || scoresList.length === 0) {
      this.leaderboardListEl.innerHTML = '<div class="lb-loading">No scores recorded yet. Be the first! 🏆</div>';
      return;
    }

    const currentClean = (activePlayerName || this.getPlayerName()).toLowerCase();

    this.leaderboardListEl.innerHTML = scoresList.map((entry, index) => {
      const rank = index + 1;
      const isCurrent = entry.name.toLowerCase() === currentClean;
      const rowClass = isCurrent ? 'lb-row active-player' : 'lb-row';

      return `
        <div class="${rowClass}">
          <span class="lb-rank">#${rank}</span>
          <span class="lb-name">${this.escapeHTML(entry.name)}</span>
          <span class="lb-score">${entry.score}</span>
        </div>
      `;
    }).join('');
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}
