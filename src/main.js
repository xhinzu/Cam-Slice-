/**
 * Main App Entry Point - State Machine, Bootstrapping, Event Binding,
 * and Module Orchestration for Fruit Slice Live.
 */

import { CameraManager } from './camera.js';
import { HandTrackerManager } from './handTracker.js';
import { UIManager } from './ui.js';
import { leaderboard } from './leaderboard.js';
import { GameManager } from './game.js';
import { MultiplayerManager } from './multiplayer.js';
import { bgm, sounds } from './audio.js';
import { userStore } from './userStore.js';

class AppController {
  constructor() {
    this.videoEl = document.getElementById('webcam-video');
    this.canvasEl = document.getElementById('game-canvas');

    this.ui = new UIManager();
    this.camera = new CameraManager(this.videoEl);
    this.handTracker = new HandTrackerManager();
    this.game = new GameManager(this.canvasEl, this.camera, this.handTracker, this.ui, leaderboard);
    this.multiplayer = new MultiplayerManager(this.game, this.ui);

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
    this.updateProfileAndStoreUI();

    // 6. Navigate to initial state (Main Menu or Direct Room Join)
    const params = new URLSearchParams(window.location.search);
    const hasRoomCode = Boolean(params.get('room'));

    const savedName = this.ui.getPlayerName();
    if (!savedName) {
      this.ui.showNameEntry();
    } else if (!hasRoomCode) {
      this.ui.showMainMenu(this.selectedLevel);
    }
  }

  updateProfileAndStoreUI() {
    // 1. Avatar Display Update
    const avatarData = userStore.getAvatar();
    const menuAvatarDisplay = document.getElementById('menu-avatar-display-el');
    const profileEmojiAvatar = document.getElementById('profile-emoji-avatar');
    const profileCustomImg = document.getElementById('profile-custom-img');

    if (avatarData.type === 'image') {
      if (menuAvatarDisplay) {
        menuAvatarDisplay.innerHTML = `<img class="menu-avatar-img" src="${avatarData.value}" alt="Avatar">`;
      }
      if (profileCustomImg) {
        profileCustomImg.src = avatarData.value;
        profileCustomImg.classList.remove('hidden');
      }
      if (profileEmojiAvatar) profileEmojiAvatar.classList.add('hidden');
    } else {
      if (menuAvatarDisplay) menuAvatarDisplay.textContent = avatarData.value;
      if (profileEmojiAvatar) {
        profileEmojiAvatar.textContent = avatarData.value;
        profileEmojiAvatar.classList.remove('hidden');
      }
      if (profileCustomImg) profileCustomImg.classList.add('hidden');
    }

    // 2. Profile Username & Stats Update
    const username = this.ui.getPlayerName() || 'Slicer';
    const profileUsernameVal = document.getElementById('profile-username-val');
    if (profileUsernameVal) profileUsernameVal.textContent = username;

    const statFruits = document.getElementById('stat-fruits-sliced');
    if (statFruits) statFruits.textContent = userStore.getTotalFruits();

    const statGlass = document.getElementById('stat-glass-shot');
    if (statGlass) statGlass.textContent = userStore.getTotalGlass();

    const profileCoinsVal = document.getElementById('profile-coins-val');
    if (profileCoinsVal) profileCoinsVal.textContent = `${userStore.getCoins()} 🪙`;

    const storeCoinsVal = document.getElementById('store-coins-val');
    if (storeCoinsVal) storeCoinsVal.textContent = userStore.getCoins();

    // 3. Store Cards Update
    const ownedCursors = userStore.getOwnedCursors();
    const equippedCursor = userStore.getEquippedCursor();

    const storeGrid = document.querySelector('.cursors-store-grid');
    if (storeGrid) {
      const cards = storeGrid.querySelectorAll('.cursor-item-card');
      cards.forEach(card => {
        const cursorId = card.dataset.cursorId;
        const btn = card.querySelector('.btn-cursor-buy');
        if (!btn) return;

        if (equippedCursor === cursorId) {
          btn.textContent = 'EQUIPPED';
          btn.className = 'btn-cursor-buy btn btn-secondary btn-small';
          btn.disabled = true;
        } else if (ownedCursors.includes(cursorId)) {
          btn.textContent = 'EQUIP';
          btn.className = 'btn-cursor-buy btn btn-glow btn-small';
          btn.disabled = false;
        } else {
          const price = cursorId === 'chroma' ? 600 : 300;
          btn.textContent = `BUY ${price} 🪙`;
          btn.className = 'btn-cursor-buy btn btn-primary btn-small';
          btn.disabled = false;
        }
      });
    }
  }

  bindEvents() {
    // BGM Speaker Mute Button Listener
    const bgmToggleBtn = document.getElementById('bgm-toggle-btn');
    const bgmIcon = document.getElementById('bgm-icon');
    if (bgmToggleBtn) {
      const updateBGMUI = (isMuted) => {
        if (bgmIcon) bgmIcon.textContent = isMuted ? '🔇' : '🔊';
        bgmToggleBtn.classList.toggle('muted', isMuted);
      };
      updateBGMUI(bgm.isMuted);

      bgmToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const muted = bgm.toggleMute();
        updateBGMUI(muted);
      });
    }

    // Name Entry Form submit -> proceed to Tutorial
    this.ui.nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      bgm.play();
      const inputVal = this.ui.nameInput.value.trim();
      if (inputVal) {
        this.ui.setPlayerName(inputVal);
        this.updateProfileAndStoreUI();
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
        bgm.play();
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    // MAIN MENU BUTTONS
    if (this.ui.menuPlayBtn) {
      this.ui.menuPlayBtn.addEventListener('click', () => {
        bgm.play();
        this.ui.hideAllModals();
        this.ui.setModeActive(this.selectedMode);
        this.game.startNewGame(this.selectedLevel, this.selectedMode);
      });
    }

    if (this.ui.menuMPBtn) {
      this.ui.menuMPBtn.addEventListener('click', () => {
        bgm.play();
        this.ui.hideAllModals();
        this.multiplayer.mpUI.showSubmenu();
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

    const profileEditNameBtn = document.getElementById('profile-edit-name-btn');
    if (profileEditNameBtn) {
      profileEditNameBtn.addEventListener('click', () => {
        this.ui.showNameEntry();
      });
    }

    if (this.ui.backToMenuBtn) {
      this.ui.backToMenuBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
        this.updateProfileAndStoreUI();
      });
    }

    if (this.ui.quitReturnBtn) {
      this.ui.quitReturnBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    const hudExitBtn = document.getElementById('hud-exit-btn');
    if (hudExitBtn) {
      hudExitBtn.addEventListener('click', () => {
        if (this.game.isPlaying) {
          this.game.triggerGameOver();
        } else {
          this.ui.showMainMenu(this.selectedLevel);
        }
      });
    }

    // USER PROFILE & STORE EVENT LISTENERS
    const menuUserBtn = document.getElementById('menu-user-btn');
    if (menuUserBtn) {
      menuUserBtn.addEventListener('click', () => {
        this.updateProfileAndStoreUI();
        this.ui.showUserProfile();
      });
    }

    const menuStoreBtn = document.getElementById('menu-store-btn');
    if (menuStoreBtn) {
      menuStoreBtn.addEventListener('click', () => {
        this.updateProfileAndStoreUI();
        this.ui.showStore();
      });
    }

    const profileBackBtn = document.getElementById('profile-back-btn');
    if (profileBackBtn) {
      profileBackBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    const storeBackBtn = document.getElementById('store-back-btn');
    if (storeBackBtn) {
      storeBackBtn.addEventListener('click', () => {
        this.ui.showMainMenu(this.selectedLevel);
      });
    }

    const editAvatarBtn = document.getElementById('edit-avatar-btn');
    const emojiPickerDrawer = document.getElementById('emoji-picker-drawer');
    if (editAvatarBtn && emojiPickerDrawer) {
      editAvatarBtn.addEventListener('click', () => {
        emojiPickerDrawer.classList.toggle('hidden');
      });
    }

    // Emoji Selection
    const emojiGrid = document.querySelector('.emoji-grid');
    if (emojiGrid) {
      emojiGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-opt-btn');
        if (btn) {
          const emoji = btn.dataset.emoji;
          userStore.setAvatar('emoji', emoji);
          this.updateProfileAndStoreUI();
          if (emojiPickerDrawer) emojiPickerDrawer.classList.add('hidden');
        }
      });
    }

    // Custom Photo Upload Option
    const uploadPhotoOptionBtn = document.getElementById('upload-photo-option-btn');
    const avatarFileInput = document.getElementById('avatar-file-input');
    if (uploadPhotoOptionBtn && avatarFileInput) {
      uploadPhotoOptionBtn.addEventListener('click', () => {
        avatarFileInput.click();
      });

      avatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            userStore.setAvatar('image', event.target.result);
            this.updateProfileAndStoreUI();
            if (emojiPickerDrawer) emojiPickerDrawer.classList.add('hidden');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Store Buy / Equip Cursors Handler
    const storeGrid = document.querySelector('.cursors-store-grid');
    if (storeGrid) {
      storeGrid.addEventListener('click', (e) => {
        const buyBtn = e.target.closest('.btn-cursor-buy');
        if (!buyBtn || buyBtn.disabled) return;

        const cursorId = buyBtn.dataset.cursorId;
        const owned = userStore.getOwnedCursors();

        if (owned.includes(cursorId)) {
          userStore.equipCursor(cursorId);
          sounds.playCombo();
        } else {
          const price = cursorId === 'chroma' ? 600 : 300;
          if (userStore.buyCursor(cursorId, price)) {
            sounds.playCombo();
          } else {
            alert('Not enough coins! Slice 5 fruits or glass panes to earn 10 coins!');
          }
        }
        this.updateProfileAndStoreUI();
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
