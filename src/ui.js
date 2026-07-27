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
    this.levelModal = document.getElementById('level-modal');
    this.gameoverModal = document.getElementById('gameover-modal');
    this.cameraErrorModal = document.getElementById('camera-error-modal');

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
    this.levelBtns = document.querySelectorAll('.level-btn');

    // Game Over display refs
    this.finalScoreEl = document.getElementById('final-score');
    this.bestScoreEl = document.getElementById('best-score');
    this.highscoreBadgeEl = document.getElementById('highscore-badge');

    this.playerNameKey = 'fruit_slice_player_name';
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
    this.levelModal.classList.add('hidden');
    this.gameoverModal.classList.add('hidden');
    this.cameraErrorModal.classList.add('hidden');
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

  updateHUDLives(remainingLives) {
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
