/**
 * Game Manager - Core Game Loop, Difficulty Configuration, Collision Detection,
 * Fruit Spawning, Particle Splatters, Combo Detection, and Lives System.
 */

import { Fruit, SlicedHalf, Particle } from './fruit.js';
import { PunchTheGlassManager } from './punchGlass.js';
import { sounds } from './audio.js';
import { userStore } from './userStore.js';

export const DIFFICULTY_CONFIGS = {
  easy: {
    spawnInterval: 1200,
    fallSpeed: 0.9,
    burstCount: [1, 1],
    bombChance: 0.10
  },
  medium: {
    spawnInterval: 800,
    fallSpeed: 1.25,
    burstCount: [1, 2],
    bombChance: 0.20
  },
  hard: {
    spawnInterval: 500,
    fallSpeed: 1.65,
    burstCount: [2, 3],
    bombChance: 0.35
  },
  freestyle: {
    spawnInterval: 750,
    fallSpeed: 1.20,
    burstCount: [1, 2],
    bombChance: 0.0
  }
};

export class GameManager {
  constructor(canvas, cameraManager, handTrackerManager, uiManager, leaderboardManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = cameraManager;
    this.handTracker = handTrackerManager;
    this.ui = uiManager;
    this.leaderboard = leaderboardManager;

    this.isPlaying = false;
    this.score = 0;
    this.lives = 3;
    this.currentLevel = 'medium';
    this.gameMode = 'fruit-slice'; // 'fruit-slice' or 'punch-glass'
    this.isMultiplayer = false;
    this.onMultiplayerSlice = null;

    // Entities & Mode Managers
    this.fruits = [];
    this.slicedHalves = [];
    this.particles = [];
    this.punchGlassManager = new PunchTheGlassManager(canvas, this);

    // Spawning & Loop
    this.lastSpawnTime = 0;
    this.animFrameId = null;

    // Combo system
    this.recentSliceCount = 0;
    this.lastSliceTimestamp = 0;

    // Screen Shake
    this.shakeDuration = 0;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  startNewGame(level = 'medium', mode = 'fruit-slice') {
    this.currentLevel = level;
    this.gameMode = mode;
    this.isMultiplayer = false;
    this.onMultiplayerSlice = null;
    this.score = 0;
    this.lives = (level === 'freestyle') ? 999 : 3;
    this.fruits = [];
    this.slicedHalves = [];
    this.particles = [];
    this.lastSpawnTime = performance.now();
    this.isPlaying = true;

    if (this.gameMode === 'punch-glass') {
      this.punchGlassManager.reset();
    }

    this.ui.updateHUDScore(0);
    this.ui.updateHUDLives(this.lives, level === 'freestyle');
    this.ui.updateLevelBadge(level);
    this.ui.setHUDVisible(true);

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.gameLoop(performance.now());
  }

  startMultiplayerGame(level = 'medium', mode = 'fruit-slice', onSliceCallback = null) {
    if (typeof mode === 'function') {
      onSliceCallback = mode;
      mode = 'fruit-slice';
    }
    this.currentLevel = level;
    this.gameMode = mode || 'fruit-slice';
    this.isMultiplayer = true;
    this.onMultiplayerSlice = onSliceCallback;
    this.score = 0;
    this.lives = 999;
    this.fruits = [];
    this.slicedHalves = [];
    this.particles = [];
    this.lastSpawnTime = performance.now();
    this.isPlaying = true;

    if (this.gameMode === 'punch-glass') {
      this.punchGlassManager.reset();
    }

    this.ui.updateHUDScore(0);
    this.ui.updateHUDLives(999);
    this.ui.updateLevelBadge(`MP-${this.gameMode === 'punch-glass' ? 'GLASS' : 'FRUIT'}-${level.toUpperCase()}`);
    this.ui.setHUDVisible(true);

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.gameLoop(performance.now());
  }

  stopGame() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.ui.setHUDVisible(false);
  }

  async triggerGameOver() {
    this.isPlaying = false;
    sounds.playGameOver();

    const playerName = this.ui.getPlayerName();
    const bestScore = await this.leaderboard.submitScore(playerName, this.score, this.gameMode);
    const isNewHighScore = this.score >= bestScore && this.score > 0;

    this.ui.setHUDVisible(false);
    this.ui.showGameOver(this.score, bestScore, isNewHighScore);
  }

  gameLoop(timestamp) {
    if (!this.isPlaying) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply Screen Shake if active
    if (this.shakeDuration > 0) {
      this.ctx.save();
      const dx = (Math.random() - 0.5) * 16;
      const dy = (Math.random() - 0.5) * 16;
      this.ctx.translate(dx, dy);
      this.shakeDuration--;
    }

    // 1. Hand Tracking & Blade Segment Detection
    const { activeBladeSegments } = this.handTracker.detectHands(
      this.camera.video,
      timestamp,
      this.canvas.width,
      this.canvas.height
    );

    // 2. Mode Specific Gameplay Logic
    if (this.gameMode === 'punch-glass') {
      this.punchGlassManager.updateAndDraw(timestamp, activeBladeSegments);
    } else {
      // Classic Fruit Slice Mode
      const config = DIFFICULTY_CONFIGS[this.currentLevel] || DIFFICULTY_CONFIGS.medium;
      if (timestamp - this.lastSpawnTime > config.spawnInterval) {
        this.spawnFruitBurst(config);
        this.lastSpawnTime = timestamp;
      }
      this.updateAndDrawEntities(activeBladeSegments, config);
    }

    // 3. Draw Glowing Blade Trails with Equipped Cursor Style
    this.handTracker.drawBladeTrails(this.ctx, activeBladeSegments, userStore.getEquippedCursor());

    if (this.shakeDuration > 0) {
      this.ctx.restore();
    }

    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  spawnFruitBurst(config) {
    const minCount = config.burstCount[0];
    const maxCount = config.burstCount[1];
    const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));

    for (let i = 0; i < count; i++) {
      const isBomb = Math.random() < config.bombChance;
      this.fruits.push(new Fruit(this.canvas.width, config.fallSpeed, isBomb));
    }
  }

  updateAndDrawEntities(bladeSegments, config) {
    // A. Update Fruits
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const fruit = this.fruits[i];
      fruit.update();
      fruit.draw(this.ctx);

      // Check offscreen fall (missed fruit)
      if (fruit.markedForDeletion) {
        if (!fruit.sliced && fruit.type === 'fruit' && !this.isMultiplayer && this.currentLevel !== 'freestyle') {
          this.lives--;
          this.ui.updateHUDLives(this.lives);
          if (this.lives <= 0) {
            this.triggerGameOver();
            return;
          }
        }
        this.fruits.splice(i, 1);
        continue;
      }

      // Check collision with slicing blade segments
      if (!fruit.sliced) {
        for (const segment of bladeSegments) {
          const hitMotion = segment.isSlicing && this.checkLineCircleCollision(
            segment.x1, segment.y1,
            segment.x2, segment.y2,
            fruit.x, fruit.y,
            fruit.radius + 20
          );
          
          const hitFingerJoint = this.checkLineCircleCollision(
            segment.dipX, segment.dipY,
            segment.x2, segment.y2,
            fruit.x, fruit.y,
            fruit.radius + 15
          );

          if (hitMotion || hitFingerJoint) {
            this.handleSlice(fruit);
            break;
          }
        }
      }
    }

    // B. Update Sliced Halves
    for (let i = this.slicedHalves.length - 1; i >= 0; i--) {
      const half = this.slicedHalves[i];
      half.update();
      half.draw(this.ctx);
      if (half.markedForDeletion) {
        this.slicedHalves.splice(i, 1);
      }
    }

    // C. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      p.draw(this.ctx);
      if (p.markedForDeletion) {
        this.particles.splice(i, 1);
      }
    }
  }

  handleSlice(entity) {
    entity.sliced = true;
    entity.markedForDeletion = true;

    if (entity.type === 'bomb') {
      // Sliced a bomb!
      sounds.playBomb();
      this.ui.triggerScreenFlash();
      this.shakeDuration = 20;

      // Spawn fiery explosion particles
      for (let i = 0; i < 15; i++) {
        if (this.particles.length < 40) {
          this.particles.push(new Particle(entity.x, entity.y, '#ff4757'));
          this.particles.push(new Particle(entity.x, entity.y, '#ffa502'));
        }
      }

      if (!this.isMultiplayer && this.currentLevel !== 'freestyle') {
        this.lives = 0;
        this.ui.updateHUDLives(0);
        this.triggerGameOver();
      } else if (this.isMultiplayer) {
        // Multiplayer: bomb penalty reduces score by 2 (min 0)
        this.score = Math.max(0, this.score - 2);
        this.ui.updateHUDScore(this.score);
        if (this.onMultiplayerSlice) {
          this.onMultiplayerSlice(this.score);
        }
      }
      return;
    }

    // Sliced a Fruit!
    sounds.playSlice();
    sounds.playSplat();

    this.score++;
    userStore.recordFruitSlice();
    this.ui.updateHUDScore(this.score);
    if (this.isMultiplayer && this.onMultiplayerSlice) {
      this.onMultiplayerSlice(this.score);
    }

    // Multi-slice combo tracking
    const now = performance.now();
    if (now - this.lastSliceTimestamp < 350) {
      this.recentSliceCount++;
      if (this.recentSliceCount >= 2) {
        sounds.playCombo();
        this.ui.showCombo(this.recentSliceCount);
      }
    } else {
      this.recentSliceCount = 1;
    }
    this.lastSliceTimestamp = now;

    // Create 2 split fruit halves flying apart
    this.slicedHalves.push(new SlicedHalf(entity.x, entity.y, entity.emoji, true, entity.color, entity.vx, entity.vy));
    this.slicedHalves.push(new SlicedHalf(entity.x, entity.y, entity.emoji, false, entity.color, entity.vx, entity.vy));

    // Create juice splash particles (capped at 40 max total)
    const countToSpawn = Math.min(10, 40 - this.particles.length);
    for (let i = 0; i < countToSpawn; i++) {
      this.particles.push(new Particle(entity.x, entity.y, entity.juiceColor));
    }
  }

  /**
   * Mathematics: Line Segment to Circle Collision Test
   */
  checkLineCircleCollision(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(cx - x1, cy - y1) <= r;
    }

    // Project point onto line segment
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    const dist = Math.hypot(cx - projX, cy - projY);
    return dist <= r + 10; // Add small generous margin for satisfying slice feel
  }
}
