/**
 * Game Manager - Core Game Loop, Difficulty Configuration, Collision Detection,
 * Fruit Spawning, Particle Splatters, Combo Detection, and Lives System.
 */

import { Fruit, SlicedHalf, Particle, ObjectPool } from './fruit.js';
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
    this.maxLives = 5;
    this.lives = 5;
    this.consecutiveHits = 0;
    this.currentLevel = 'medium';
    this.gameMode = 'fruit-slice'; // 'fruit-slice' or 'punch-glass'
    this.isMultiplayer = false;
    this.onMultiplayerSlice = null;

    // High performance Object Pools
    this.fruitPool = new ObjectPool((...args) => new Fruit(...args));
    this.halfPool = new ObjectPool((...args) => new SlicedHalf(...args));
    this.particlePool = new ObjectPool((...args) => new Particle(...args));

    // Adaptive Performance Scaling
    this.isLowEndDevice = Boolean((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || window.innerWidth <= 600);
    this.maxParticles = this.isLowEndDevice ? 18 : 35;

    // FPS & Delta Time Monitoring
    this.lastFrameTime = 0;
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.showFPSCounter = false;
    this.initDebugControls();

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

  initDebugControls() {
    window.toggleFPSCounter = () => {
      this.showFPSCounter = !this.showFPSCounter;
      console.log(`FPS Counter: ${this.showFPSCounter ? 'ENABLED' : 'DISABLED'}`);
      return this.showFPSCounter;
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~' || e.key === 'F8') {
        this.showFPSCounter = !this.showFPSCounter;
      }
    });
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
    this.maxLives = 5;
    this.lives = (level === 'freestyle') ? 999 : 5;
    this.consecutiveHits = 0;
    this.fruits = [];
    this.slicedHalves = [];
    this.particles = [];
    this.lastSpawnTime = performance.now();
    this.isPlaying = true;

    if (this.gameMode === 'punch-glass') {
      this.punchGlassManager.reset();
    }

    this.ui.updateHUDScore(0);
    this.ui.updateHUDLives(this.lives, level === 'freestyle', this.maxLives);
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

    // Delta-time calculation for frame-rate independent movement
    const dt = this.lastFrameTime ? Math.min(3.0, (timestamp - this.lastFrameTime) / 16.667) : 1.0;
    this.lastFrameTime = timestamp;

    // Monitor FPS
    this.frameCount++;
    if (timestamp - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / Math.max(1, timestamp - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;
    }

    if (this.camera && typeof this.camera.ensureActiveStream === 'function') {
      this.camera.ensureActiveStream();
    }

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
    const { activeBladeSegments, rawHandLandmarks } = this.handTracker.detectHands(
      this.camera.video,
      timestamp,
      this.canvas.width,
      this.canvas.height
    );

    // 2. Draw AI Hand Exoskeleton Filter (Visual Feature)
    this.handTracker.drawHandExoskeleton(this.ctx, rawHandLandmarks, userStore.getEquippedExoskeleton(), this.gameMode);

    // 3. Mode Specific Gameplay Logic
    if (this.gameMode === 'punch-glass') {
      this.punchGlassManager.updateAndDraw(timestamp, activeBladeSegments, dt);
    } else {
      // Classic Fruit Slice Mode
      const config = DIFFICULTY_CONFIGS[this.currentLevel] || DIFFICULTY_CONFIGS.medium;
      if (timestamp - this.lastSpawnTime > config.spawnInterval) {
        this.spawnFruitBurst(config);
        this.lastSpawnTime = timestamp;
      }
      this.updateAndDrawEntities(activeBladeSegments, config, dt);
    }

    // 4. Draw Glowing Blade Trails with Equipped Cursor Style (Fruit Slice Mode only)
    if (this.gameMode !== 'punch-glass') {
      this.handTracker.drawBladeTrails(this.ctx, activeBladeSegments, userStore.getEquippedCursor());
    }

    if (this.shakeDuration > 0) {
      this.ctx.restore();
    }

    // 4. Debug FPS Overlay (Toggle with ~ or window.toggleFPSCounter())
    if (this.showFPSCounter) {
      this.renderFPSCounter(dt);
    }

    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  renderFPSCounter(dt) {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.strokeStyle = '#00f2fe';
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(16, 16, 160, 54);
    this.ctx.strokeRect(16, 16, 160, 54);

    this.ctx.font = 'bold 14px "Fredoka", sans-serif';
    this.ctx.fillStyle = '#00f2fe';
    this.ctx.fillText(`FPS: ${this.fps} (dt: ${dt.toFixed(2)})`, 28, 38);
    this.ctx.font = '11px sans-serif';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText(`${this.isLowEndDevice ? 'Mobile/Low-End' : 'High Performance'} Tier`, 28, 56);
    this.ctx.restore();
  }

  spawnFruitBurst(config) {
    const minCount = config.burstCount[0];
    const maxCount = config.burstCount[1];
    const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));

    for (let i = 0; i < count; i++) {
      const isBomb = Math.random() < config.bombChance;
      this.fruits.push(this.fruitPool.get(this.canvas.width, config.fallSpeed, isBomb));
    }
  }

  registerHit() {
    this.consecutiveHits++;
    if (this.consecutiveHits >= 3) {
      this.consecutiveHits = 0;
      if (this.lives < this.maxLives && this.lives > 0 && this.currentLevel !== 'freestyle') {
        this.lives++;
        this.ui.updateHUDLives(this.lives, false, this.maxLives);
        sounds.playCombo();
        this.ui.showCombo('❤️ +1 HEART!');
      }
    }
  }

  updateAndDrawEntities(bladeSegments, config, dt = 1.0) {
    // A. Update Fruits
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const fruit = this.fruits[i];
      fruit.update(dt);
      fruit.draw(this.ctx);

      // Check offscreen fall (missed fruit)
      if (fruit.markedForDeletion) {
        if (!fruit.sliced && fruit.type === 'fruit' && !this.isMultiplayer && this.currentLevel !== 'freestyle') {
          this.lives--;
          this.consecutiveHits = 0;
          this.ui.updateHUDLives(this.lives, false, this.maxLives);
          if (this.lives <= 0) {
            this.triggerGameOver();
            return;
          }
        }
        const removed = this.fruits.splice(i, 1)[0];
        this.fruitPool.release(removed);
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
      half.update(dt);
      half.draw(this.ctx);
      if (half.markedForDeletion) {
        const removed = this.slicedHalves.splice(i, 1)[0];
        this.halfPool.release(removed);
      }
    }

    // C. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      p.draw(this.ctx);
      if (p.markedForDeletion) {
        const removed = this.particles.splice(i, 1)[0];
        this.particlePool.release(removed);
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

      // Spawn fiery explosion particles (capped adaptively)
      const countToSpawn = Math.min(12, this.maxParticles - this.particles.length);
      for (let i = 0; i < countToSpawn; i++) {
        this.particles.push(this.particlePool.get(entity.x, entity.y, i % 2 === 0 ? '#ff4757' : '#ffa502'));
      }

      this.consecutiveHits = 0;
      if (!this.isMultiplayer && this.currentLevel !== 'freestyle') {
        this.lives = 0;
        this.ui.updateHUDLives(0, false, this.maxLives);
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
    this.registerHit();
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

    // Create 2 split fruit halves flying apart (from Half ObjectPool)
    this.slicedHalves.push(this.halfPool.get(entity.x, entity.y, entity.emoji, true, entity.color, entity.vx, entity.vy));
    this.slicedHalves.push(this.halfPool.get(entity.x, entity.y, entity.emoji, false, entity.color, entity.vx, entity.vy));

    // Create juice splash particles (from Particle ObjectPool, capped adaptively)
    const countToSpawn = Math.min(8, this.maxParticles - this.particles.length);
    for (let i = 0; i < countToSpawn; i++) {
      this.particles.push(this.particlePool.get(entity.x, entity.y, entity.juiceColor));
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
