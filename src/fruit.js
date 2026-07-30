/**
 * Fruit Module - Entity definition for Fruits & Bombs, top-down falling physics,
 * emoji canvas rendering, slice half-splitting physics, and particle explosion bursts.
 */

export const FRUIT_TYPES = [
  { emoji: '🍎', name: 'Apple', color: '#ff4757', juiceColor: '#ff6b81', radius: 45 },
  { emoji: '🍊', name: 'Orange', color: '#ffa502', juiceColor: '#ff7f50', radius: 45 },
  { emoji: '🍋', name: 'Lemon', color: '#eccc68', juiceColor: '#ffa502', radius: 42 },
  { emoji: '🍉', name: 'Watermelon', color: '#2ed573', juiceColor: '#ff4757', radius: 52 },
  { emoji: '🍇', name: 'Grapes', color: '#a55eea', juiceColor: '#8854d0', radius: 45 },
  { emoji: '🍓', name: 'Strawberry', color: '#ff4d4d', juiceColor: '#ff3838', radius: 40 },
  { emoji: '🍍', name: 'Pineapple', color: '#f7b731', juiceColor: '#fa8231', radius: 50 },
  { emoji: '🍑', name: 'Peach', color: '#ff7854', juiceColor: '#eb3b5a', radius: 45 },
  { emoji: '🥝', name: 'Kiwi', color: '#20bf6b', juiceColor: '#26de81', radius: 40 },
  { emoji: '🥑', name: 'Avocado', color: '#26de81', juiceColor: '#20bf6b', radius: 44 }
];

export class Fruit {
  constructor(canvasWidth = 1280, fallSpeedMultiplier = 1.0, isBomb = false) {
    this.reset(canvasWidth, fallSpeedMultiplier, isBomb);
  }

  reset(canvasWidth, fallSpeedMultiplier = 1.0, isBomb = false) {
    this.canvasWidth = canvasWidth;
    this.isBomb = isBomb;
    
    if (this.isBomb) {
      this.emoji = '💣';
      this.color = '#2f3542';
      this.juiceColor = '#ff4757';
      this.radius = 46;
      this.type = 'bomb';
    } else {
      const template = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
      this.emoji = template.emoji;
      this.color = template.color;
      this.juiceColor = template.juiceColor;
      this.radius = template.radius;
      this.type = 'fruit';
    }

    const margin = 80;
    this.x = margin + Math.random() * (Math.max(100, canvasWidth) - margin * 2);
    this.y = -60;

    this.vx = (Math.random() - 0.5) * 2.2;
    this.vy = (1.1 + Math.random() * 1.2) * fallSpeedMultiplier;
    this.gravity = 0.085 * fallSpeedMultiplier;

    this.rotation = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.04;

    this.sliced = false;
    this.markedForDeletion = false;
    return this;
  }

  update(dt = 1.0) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.rotation += this.vRot * dt;

    const bottomBound = (typeof window !== 'undefined' ? window.innerHeight : 1000) + 80;
    if (this.y - this.radius > bottomBound) {
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    if (this.sliced) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.font = `${this.radius * 1.8}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);

    ctx.restore();
  }
}

/**
 * Split Fruit Halves flying apart when sliced
 */
export class SlicedHalf {
  constructor(x = 0, y = 0, emoji = '🍎', isLeft = true, color = '#ff4757', vx = 0, vy = 0) {
    this.reset(x, y, emoji, isLeft, color, vx, vy);
  }

  reset(x, y, emoji, isLeft, color, vx, vy) {
    this.x = x;
    this.y = y;
    this.emoji = emoji;
    this.isLeft = isLeft;
    this.color = color;
    
    this.vx = (vx * 0.5 || 0) + (isLeft ? -3.0 : 3.0);
    this.vy = (vy * 0.5 || 0) - 1.2;
    this.gravity = 0.14;
    this.rotation = 0;
    this.vRot = isLeft ? -0.06 : 0.06;
    this.opacity = 1.0;
    this.markedForDeletion = false;
    return this;
  }

  update(dt = 1.0) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.rotation += this.vRot * dt;
    this.opacity -= 0.015 * dt;

    if (this.opacity <= 0 || this.y > 1200) {
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.beginPath();
    if (this.isLeft) {
      ctx.rect(-60, -60, 60, 120);
    } else {
      ctx.rect(0, -60, 60, 120);
    }
    ctx.clip();

    ctx.font = '75px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);

    ctx.restore();
  }
}

/**
 * Juice Particle Bursts
 */
export class Particle {
  constructor(x = 0, y = 0, color = '#ff4757') {
    this.reset(x, y, color);
  }

  reset(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5.0;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = 0.10;
    this.radius = 3 + Math.random() * 6;
    this.opacity = 1.0;
    this.markedForDeletion = false;
    return this;
  }

  update(dt = 1.0) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.opacity -= 0.025 * dt;
    this.radius *= Math.pow(0.96, dt);

    if (this.opacity <= 0 || this.radius < 0.5) {
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

/**
 * High Performance Object Pool pattern to eliminate Garbage Collection pauses
 */
export class ObjectPool {
  constructor(createFn) {
    this.createFn = createFn;
    this.pool = [];
  }

  get(...args) {
    if (this.pool.length > 0) {
      const obj = this.pool.pop();
      if (typeof obj.reset === 'function') {
        obj.reset(...args);
      }
      return obj;
    }
    return this.createFn(...args);
  }

  release(obj) {
    if (obj && this.pool.length < 200) {
      this.pool.push(obj);
    }
  }
}
