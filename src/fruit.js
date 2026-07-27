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
  constructor(canvasWidth, fallSpeedMultiplier = 1.0, isBomb = false) {
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

    // Spawn parameters top-down
    const margin = 80;
    this.x = margin + Math.random() * (canvasWidth - margin * 2);
    this.y = -60;

    // Physics
    this.vx = (Math.random() - 0.5) * 3.5;
    this.vy = (2.5 + Math.random() * 2.5) * fallSpeedMultiplier;
    this.gravity = 0.22 * fallSpeedMultiplier;

    // Rotation
    this.rotation = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.08;

    this.sliced = false;
    this.markedForDeletion = false;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.rotation += this.vRot;

    // Offscreen bottom check
    if (this.y - this.radius > 1000) {
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
  constructor(x, y, emoji, isLeft, color, vx, vy) {
    this.x = x;
    this.y = y;
    this.emoji = emoji;
    this.isLeft = isLeft;
    this.color = color;
    
    this.vx = vx + (isLeft ? -4.5 : 4.5);
    this.vy = vy - 2.0;
    this.gravity = 0.35;
    this.rotation = 0;
    this.vRot = isLeft ? -0.12 : 0.12;
    this.opacity = 1.0;
    this.markedForDeletion = false;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.rotation += this.vRot;
    this.opacity -= 0.018;

    if (this.opacity <= 0 || this.y > 1200) {
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Clip half circle to visually simulate a sliced fruit half
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
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 8;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = 0.25;
    this.radius = 3 + Math.random() * 6;
    this.opacity = 1.0;
    this.markedForDeletion = false;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.opacity -= 0.025;
    this.radius *= 0.96;

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
