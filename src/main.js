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
    });

    // 5. Bind User Interface Events
    this.bindEvents();

    // 6. Navigate to initial state
    const savedName = this.ui.getPlayerName();
    if (!savedName) {
      this.ui.showNameEntry();
    } else {
      this.ui.showLevelSelect(this.selectedLevel);
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
        });
      }
    });

    // "I Understand" Button on Tutorial Modal
    if (this.ui.understandBtn) {
      this.ui.understandBtn.addEventListener('click', () => {
        this.ui.showLevelSelect(this.selectedLevel);
      });
    }

    // "How to Play" Button on Level Select Modal
    if (this.ui.viewTutorialBtn) {
      this.ui.viewTutorialBtn.addEventListener('click', () => {
        this.ui.showTutorial();
      });
    }

    // Toggle Leaderboard visibility (Eye Icon)
    if (this.ui.toggleLBBtn) {
      this.ui.toggleLBBtn.addEventListener('click', () => {
        this.ui.toggleLeaderboard();
      });
    }

    // Level selection cards
    this.ui.levelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedLevel = btn.dataset.level;
        this.ui.setLevelActive(this.selectedLevel);
      });
    });

    // Start Game Button
    this.ui.startGameBtn.addEventListener('click', () => {
      this.ui.hideAllModals();
      this.game.startNewGame(this.selectedLevel);
    });

    // Change Name Button
    this.ui.changeNameBtn.addEventListener('click', () => {
      this.ui.showNameEntry();
    });

    // Game Over: Restart Button
    this.ui.restartBtn.addEventListener('click', () => {
      this.ui.hideAllModals();
      this.game.startNewGame(this.selectedLevel);
    });

    // Game Over: Change Level Button
    this.ui.changeLevelBtn.addEventListener('click', () => {
      this.ui.showLevelSelect(this.selectedLevel);
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
