/**
 * Punch the Glass Mode - 3x3 Grid, Translucent Frosted Glass Panes,
 * Glass Shatter Particle Effects, Penalty Red Panes, and Punch Gesture Detection.
 */

import { sounds } from './audio.js';

export const PUNCH_GLASS_CONFIGS = {
  easy: {
    spawnInterval: 1500,
    maxPanes: 2,
    redChance: 0.20,
    lifespan: 4000
  },
  medium: {
    spawnInterval: 1000,
    maxPanes: 3,
    redChance: 0.30,
    lifespan: 3000
  },
  hard: {
    spawnInterval: 700,
    maxPanes: 4,
    redChance: 0.40,
    lifespan: 2000
  }
};

/**
 * Glass Shard Particle Fragment
 */
export class GlassShard {
  constructor(x, y, color = '#ffffff') {
    this.x = x;
    this.y = y;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 9;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = 0.28;
    this.size = 4 + Math.random() * 10;
    this.rotation = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.25;
    this.opacity = 1.0;
    this.markedForDeletion = false;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.rotation += this.vRot;
    this.opacity -= 0.028;
    if (this.opacity <= 0) {
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -this.size);
    ctx.lineTo(this.size * 0.7, this.size * 0.8);
    ctx.lineTo(-this.size * 0.7, this.size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Glass Pane entity in 3x3 Grid
 */
export class GlassPane {
  constructor(cellIndex, row, col, x, y, width, height, type, lifespan) {
    this.cellIndex = cellIndex;
    this.row = row;
    this.col = col;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.type = type; // 'green' or 'red'
    this.lifespan = lifespan;
    this.createdAt = performance.now();
    this.punched = false;
    this.markedForDeletion = false;
  }

  getAge(now) {
    return now - this.createdAt;
  }

  isExpired(now) {
    return this.getAge(now) >= this.lifespan;
  }

  draw(ctx, now) {
    if (this.punched) return;

    const age = this.getAge(now);
    const progress = Math.min(1, age / this.lifespan);

    // Fade out during last 500ms
    let opacity = 1.0;
    const remainingTime = this.lifespan - age;
    if (remainingTime < 500) {
      opacity = Math.max(0, remainingTime / 500);
    }

    ctx.save();
    ctx.globalAlpha = opacity;

    const isGreen = this.type === 'green';
    const baseFill = isGreen ? 'rgba(0, 200, 100, 0.25)' : 'rgba(220, 40, 40, 0.25)';
    const strokeStyle = isGreen ? 'rgba(46, 213, 115, 0.95)' : 'rgba(255, 71, 87, 0.95)';

    // 1. Translucent Frosted Pane Background Fill
    ctx.fillStyle = baseFill;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // 2. Frosted Glass Texture (Cracks/Reflections)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.x + 15, this.y + 15);
    ctx.lineTo(this.x + this.width * 0.45, this.y + this.height * 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.x + this.width * 0.3, this.y + 15);
    ctx.lineTo(this.x + this.width - 15, this.y + this.height * 0.7);
    ctx.stroke();

    // 3. Border Outline
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x + 2, this.y + 2, this.width - 4, this.height - 4);

    // 4. Lifespan Timer Bar at Top
    const barWidth = (this.width - 12) * (1 - progress);
    ctx.fillStyle = isGreen ? '#2ed573' : '#ff4757';
    ctx.fillRect(this.x + 6, this.y + 6, Math.max(0, barWidth), 4);

    // 5. Type Icon Indicator
    ctx.font = '36px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGreen ? '🟩' : '🟥', this.x + this.width / 2, this.y + this.height / 2);

    ctx.restore();
  }
}

/**
 * PunchTheGlassManager - Manages Punch the Glass Game Mode
 */
export class PunchTheGlassManager {
  constructor(canvas, gameManager) {
    this.canvas = canvas;
    this.ctx = gameManager.ctx;
    this.game = gameManager;

    this.panes = [];
    this.shards = [];
    this.lastSpawnTime = 0;
  }

  reset() {
    this.panes = [];
    this.shards = [];
    this.lastSpawnTime = performance.now();
  }

  getGridBounds() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    const marginTop = 90;
    const marginBottom = 50;
    const marginSide = Math.max(20, (width - (height - marginTop - marginBottom) * 1.2) / 2);

    const gridLeft = marginSide;
    const gridTop = marginTop;
    const gridWidth = width - marginSide * 2;
    const gridHeight = height - marginTop - marginBottom;

    const cellWidth = gridWidth / 3;
    const cellHeight = gridHeight / 3;

    return { gridLeft, gridTop, gridWidth, gridHeight, cellWidth, cellHeight };
  }

  drawCenterIdleZone(bounds) {
    const { gridLeft, gridTop, cellWidth, cellHeight } = bounds;
    const centerCol = 1;
    const centerRow = 1;

    const x = gridLeft + centerCol * cellWidth + 6;
    const y = gridTop + centerRow * cellHeight + 6;
    const w = cellWidth - 12;
    const h = cellHeight - 12;

    this.ctx.save();

    // 1. Shaded Idle Safe Zone Fill
    const gradient = this.ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.12)');
    gradient.addColorStop(1, 'rgba(79, 172, 254, 0.05)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x, y, w, h);

    // 2. Glowing Safe Border Line
    this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
    this.ctx.lineWidth = 2.5;
    this.ctx.setLineDash([8, 6]);
    this.ctx.strokeRect(x, y, w, h);

    // 3. Center Icon & Text Label
    this.ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('🛡️', x + w / 2, y + h / 2 - 12);

    this.ctx.font = 'bold 12px "Fredoka", "Outfit", sans-serif';
    this.ctx.fillStyle = 'rgba(0, 242, 254, 0.95)';
    this.ctx.shadowColor = 'rgba(0, 242, 254, 0.8)';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('IDLE ZONE', x + w / 2, y + h / 2 + 14);

    this.ctx.restore();
  }

  drawGridLines(bounds) {
    const { gridLeft, gridTop, gridWidth, gridHeight, cellWidth, cellHeight } = bounds;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([6, 6]);

    // Outer Border
    this.ctx.strokeRect(gridLeft, gridTop, gridWidth, gridHeight);

    // Vertical grid lines
    for (let c = 1; c < 3; c++) {
      const x = gridLeft + c * cellWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(x, gridTop);
      this.ctx.lineTo(x, gridTop + gridHeight);
      this.ctx.stroke();
    }

    // Horizontal grid lines
    for (let r = 1; r < 3; r++) {
      const y = gridTop + r * cellHeight;
      this.ctx.beginPath();
      this.ctx.moveTo(gridLeft, y);
      this.ctx.lineTo(gridLeft + gridWidth, y);
      this.ctx.stroke();
    }

    this.ctx.restore();

    // Draw Shaded Center Idle Zone
    this.drawCenterIdleZone(bounds);
  }

  updateAndDraw(timestamp, bladeSegments) {
    const bounds = this.getGridBounds();
    const config = PUNCH_GLASS_CONFIGS[this.game.currentLevel] || PUNCH_GLASS_CONFIGS.medium;

    // 1. Draw Faint 3x3 Grid Lines & Center Idle Zone
    this.drawGridLines(bounds);

    // 2. Spawn Glass Panes in Random Empty Outer Cells (Excluding Center Index 4)
    if (timestamp - this.lastSpawnTime > config.spawnInterval) {
      this.spawnPane(bounds, config);
      this.lastSpawnTime = timestamp;
    }

    // 3. Process Panes & Punch Collisions
    for (let i = this.panes.length - 1; i >= 0; i--) {
      const pane = this.panes[i];

      // Check if green pane expired naturally (no penalty for green miss)
      if (pane.isExpired(timestamp)) {
        this.panes.splice(i, 1);
        continue;
      }

      // Check punch gesture collision
      if (!pane.punched) {
        let isPunched = false;
        for (const segment of bladeSegments) {
          if (segment.isSlicing || segment.velocity >= 0.3) {
            // Check if fingertip point (x2, y2) or segment falls inside pane bounding box
            if (
              segment.x2 >= pane.x &&
              segment.x2 <= pane.x + pane.width &&
              segment.y2 >= pane.y &&
              segment.y2 <= pane.y + pane.height
            ) {
              isPunched = true;
              break;
            }
          }
        }

        if (isPunched) {
          this.handlePunch(pane, i);
          continue;
        }
      }

      pane.draw(this.ctx, timestamp);
    }

    // 4. Update & Draw Glass Shard Fragments
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const shard = this.shards[i];
      shard.update();
      shard.draw(this.ctx);
      if (shard.markedForDeletion) {
        this.shards.splice(i, 1);
      }
    }
  }

  spawnPane(bounds, config) {
    if (this.panes.length >= config.maxPanes) return;

    // Find unoccupied cell indices from the 8 outer cells (EXCLUDING CENTER INDEX 4)
    const occupiedCells = new Set(this.panes.map(p => p.cellIndex));
    const emptyCells = [];
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue; // Skip center cell (Index 4) -> Reserved as IDLE ZONE
      if (!occupiedCells.has(i)) emptyCells.push(i);
    }

    if (emptyCells.length === 0) return;

    const cellIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const row = Math.floor(cellIndex / 3);
    const col = cellIndex % 3;

    const x = bounds.gridLeft + col * bounds.cellWidth + 6;
    const y = bounds.gridTop + row * bounds.cellHeight + 6;
    const w = bounds.cellWidth - 12;
    const h = bounds.cellHeight - 12;

    const isRed = Math.random() < config.redChance;
    const type = isRed ? 'red' : 'green';

    this.panes.push(new GlassPane(cellIndex, row, col, x, y, w, h, type, config.lifespan));
  }

  handlePunch(pane, index) {
    pane.punched = true;
    this.panes.splice(index, 1);

    sounds.playGlassShatter();

    const centerX = pane.x + pane.width / 2;
    const centerY = pane.y + pane.height / 2;
    const shardColor = pane.type === 'green' ? 'rgba(46, 213, 115, 0.85)' : 'rgba(255, 71, 87, 0.85)';

    // Spawn 22 Glass Shard Particles
    for (let i = 0; i < 22; i++) {
      if (this.shards.length < 50) {
        this.shards.push(new GlassShard(centerX, centerY, Math.random() < 0.5 ? '#ffffff' : shardColor));
      }
    }

    if (pane.type === 'green') {
      // Safe Green Hit -> Score!
      this.game.score++;
      this.game.ui.updateHUDScore(this.game.score);
      if (this.game.isMultiplayer && typeof this.game.onMultiplayerSlice === 'function') {
        this.game.onMultiplayerSlice(this.game.score);
      }
    } else {
      // Danger Red Hit -> Penalty & Life Loss!
      sounds.playBomb();
      this.game.ui.triggerScreenFlash();
      this.game.shakeDuration = 15;
      if (!this.game.isMultiplayer) {
        this.game.lives--;
        this.game.ui.updateHUDLives(this.game.lives);

        if (this.game.lives <= 0) {
          this.game.triggerGameOver();
        }
      } else {
        this.game.score = Math.max(0, this.game.score - 2);
        this.game.ui.updateHUDScore(this.game.score);
        if (typeof this.game.onMultiplayerSlice === 'function') {
          this.game.onMultiplayerSlice(this.game.score);
        }
      }
    }
  }
}
