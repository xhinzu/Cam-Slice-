/**
 * Main App Entry Point - State Machine, Bootstrapping, Event Binding,
 * and Module Orchestration for Fruit Slice Live.
 */

import { CameraManager } from './camera.js';
import { HandTrackerManager } from './handTracker.js';
import { UIManager } from './ui.js';
import { leaderboard } from './leaderboard.js';
import { GameManager } from './game.js';

class AppController {
  constructor() {
    this.videoEl = document.getElementById('webcam-video');
    this.canvasEl = document.getElementById('game-canvas');

    this.ui = new UIManager();
    this.camera = new CameraManager(this.videoEl);
    this.handTracker = new HandTrackerManager();
    this.game = new GameManager(this.canvasEl, this.camera, this.handTracker, this.ui, leaderboard);

    this.selectedLevel = 'medium';
    this.selectedMode = 'fruit-slice';

    this.init();
  }

  async init() {
    // 1. Show loading screen
    this.ui.showLoading('Starting webcam feed...');

    // 2. Start Camera
    try {
      await this.camera.startCamera();
    } catch (err) {
      console.error('Camera initialization failed:', err);
      this.ui.showCameraError();
      this.bindCameraRetry();
      return;
    }

    // 3. Initialize MediaPipe Hand Tracker AI
    try {
      await this.handTracker.initialize((statusMsg) => {
        this.ui.showLoading(statusMsg);
      });
    } catch (err) {
      console.error('MediaPipe initialization failed:', err);
      this.ui.showLoading('Failed to load HandLandmarker model. Please refresh.');
      return;
    }

    // 4. Connect real-time Leaderboard subscriber
    leaderboard.subscribeTopScores((scores) => {
      this.ui.renderLeaderboard(scores, this.ui.getPlayerName());
    }, this.ui.getPlayerName(), this.selectedMode);

    // 5. Bind User Interface Events
    this.bindEvents();

    // 6. Navigate to initial state (Main Menu)
    const savedName = this.ui.getPlayerName();
    if (!savedName) {
      this.ui.showNameEntry();
    } else {
      this.ui.showMainMenu(this.selectedLevel);
    }
  }

  bindEvents() {
    // Name Entry Form submit -> proceed to Tutorial
    this.ui.nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const inputVal = this.ui.nameInput.value.trim();
      if (inputVal) {
        this.ui.setPlayerName(inputVal);
        this.ui.showTutorial();
        // Refresh leaderboard active player highlight
        leaderboard.subscribeTopScores((scores) => {
          this.ui.renderLeaderboard(scores, inputVal);
        }, inputVal, this.selectedMode);
      }
    });

    // "I Understand" Button on Tutorial Modal -> Go to Main Menu
    if (this.ui.understandBtn) {
      this.ui.understandBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    // MAIN MENU BUTTONS
    if (this.ui.menuPlayBtn) {
      this.ui.menuPlayBtn.addEventListener('click', () => {
        this.ui.hideAllModals();
        this.ui.setModeActive(this.selectedMode);
        this.game.startNewGame(this.selectedLevel, this.selectedMode);
      });
    }

    if (this.ui.menuModesBtn) {
      this.ui.menuModesBtn.addEventListener('click', () => {
        this.ui.showLevelSelect(this.selectedLevel);
      });
    }

    if (this.ui.menuTutorialBtn) {
      this.ui.menuTutorialBtn.addEventListener('click', () => {
        this.ui.showTutorial();
      });
    }

    if (this.ui.menuQuitBtn) {
      this.ui.menuQuitBtn.addEventListener('click', () => {
        try { window.close(); } catch (err) {}
        this.ui.showQuit();
      });
    }

    if (this.ui.menuEditNameBtn) {
      this.ui.menuEditNameBtn.addEventListener('click', () => {
        this.ui.showNameEntry();
      });
    }

    if (this.ui.backToMenuBtn) {
      this.ui.backToMenuBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    if (this.ui.quitReturnBtn) {
      this.ui.quitReturnBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    // Mode Selection Cards (Fruit Slice vs Punch Glass)
    this.ui.modeCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectedMode = card.dataset.mode;
        this.ui.setModeActive(this.selectedMode);
        this.ui.setLBTabActive(this.selectedMode);
        leaderboard.refreshTopScores(this.selectedMode);
      });
    });

    // Leaderboard HUD Mode Tabs
    this.ui.lbTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.lbMode;
        this.selectedMode = mode;
        this.ui.setModeActive(mode);
        this.ui.setLBTabActive(mode);
        leaderboard.refreshTopScores(mode);
      });
    });

    // Toggle Leaderboard visibility (Eye Icon)
    if (this.ui.toggleLBBtn) {
      this.ui.toggleLBBtn.addEventListener('click', () => {
        this.ui.toggleLeaderboard();
      });
    }

    // Level / Modes selection cards
    this.ui.levelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        this.selectedLevel = btn.dataset.level;
        this.ui.setLevelActive(this.selectedLevel);
      });
    });

    // Start Game Button on Level Modal
    this.ui.startGameBtn.addEventListener('click', () => {
      this.ui.hideAllModals();
      this.ui.setModeActive(this.selectedMode);
      this.game.startNewGame(this.selectedLevel, this.selectedMode);
    });

    // Change Name Button
    this.ui.changeNameBtn.addEventListener('click', () => {
      this.ui.showNameEntry();
    });

    // Game Over: Restart Button
    this.ui.restartBtn.addEventListener('click', () => {
      this.ui.hideAllModals();
      this.ui.setModeActive(this.selectedMode);
      this.game.startNewGame(this.selectedLevel, this.selectedMode);
    });

    // Game Over: Change Level Button -> Goes to Main Menu
    this.ui.changeLevelBtn.addEventListener('click', () => {
      this.ui.showMainMenu(this.selectedLevel);
    });
  }

  bindCameraRetry() {
    this.ui.retryCameraBtn.onclick = async () => {
      this.ui.showLoading('Retrying camera access...');
      try {
        await this.camera.startCamera();
        this.init();
      } catch (e) {
        this.ui.showCameraError();
      }
    };
  }
}

// Bootstrap app on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
