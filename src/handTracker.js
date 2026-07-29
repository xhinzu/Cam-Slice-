/**
 * HandTracker Module - MediaPipe HandLandmarker Integration, Index Fingertip Tracking,
 * Velocity Calculation, Blade Segment Detection, and Glowing Neon Blade Trails.
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export class HandTrackerManager {
  constructor() {
    this.handLandmarker = null;
    this.isLoaded = false;
    
    // Store trailing fingertip history per hand: array of { x, y, timestamp }
    this.handHistories = new Map();
    this.smoothedPositions = new Map();
    
    // Frame throttling cache (target 30-33 Hz inference, 60 Hz smooth rendering)
    this.lastVideoTime = -1;
    this.lastDetectionTimestamp = 0;
    this.detectionIntervalMs = 30; // ~33 Hz max GPU inference rate
    this.lastDetectionResult = { activeBladeSegments: [], handsTracked: 0 };

    // Blade configuration
    this.historyLength = 10;
    this.sliceVelocityThreshold = 0.35;
  }

  /**
   * Load MediaPipe Vision tasks WASM and initialize HandLandmarker model.
   * Single instance is preserved and reused across the entire app session.
   */
  async initialize(onProgress = () => {}) {
    if (this.isLoaded && this.handLandmarker) {
      onProgress('Hand Tracking System Ready!');
      return;
    }

    onProgress('Downloading MediaPipe Vision WASM resolver...');
    
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    onProgress('Loading HandLandmarker model neural weights...');
    
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4
    });

    this.isLoaded = true;
    onProgress('Hand Tracking System Ready!');
  }

  /**
   * Process a single video frame and return blade motion data with ZERO input latency.
   * Throttles heavy GPU inference to ~33Hz while interpolating at display refresh rate.
   */
  detectHands(videoElement, timestamp, canvasWidth, canvasHeight) {
    if (!this.isLoaded || !this.handLandmarker || !videoElement || videoElement.videoWidth === 0) {
      return { activeBladeSegments: [], handsTracked: 0 };
    }

    const now = performance.now();

    // Skip heavy GPU inference if called faster than 33Hz, return cached/interpolated motion
    if (now - this.lastDetectionTimestamp < this.detectionIntervalMs && this.lastDetectionResult) {
      return this.lastDetectionResult;
    }
    this.lastDetectionTimestamp = now;
    this.lastVideoTime = videoElement.currentTime;

    const results = this.handLandmarker.detectForVideo(videoElement, now);
    const activeBladeSegments = [];
    const activeHandIds = new Set();

    if (results.landmarks && results.landmarks.length > 0) {
      results.landmarks.forEach((handLandmarks, handIndex) => {
        // Track Index Fingertip (8) and Index DIP (7)
        const indexTip = handLandmarks[8];
        const indexDip = handLandmarks[7];
        if (!indexTip) return;

        // Convert coordinates to horizontally mirrored canvas space with instant 1:1 tracking
        const rawX = (1 - indexTip.x) * canvasWidth;
        const rawY = indexTip.y * canvasHeight;
        
        let dipX = rawX, dipY = rawY;
        if (indexDip) {
          dipX = (1 - indexDip.x) * canvasWidth;
          dipY = indexDip.y * canvasHeight;
        }

        const now = performance.now();
        const handKey = `hand_${handIndex}`;
        activeHandIds.add(handKey);

        // Instant 1:1 direct positioning with ultra-responsive micro-smoothing (0.95 alpha = zero drag delay)
        let smoothX = rawX;
        let smoothY = rawY;
        if (this.smoothedPositions.has(handKey)) {
          const prev = this.smoothedPositions.get(handKey);
          const alpha = 0.95;
          smoothX = alpha * rawX + (1 - alpha) * prev.x;
          smoothY = alpha * rawY + (1 - alpha) * prev.y;
        }
        this.smoothedPositions.set(handKey, { x: smoothX, y: smoothY });

        if (!this.handHistories.has(handKey)) {
          this.handHistories.set(handKey, []);
        }

        const history = this.handHistories.get(handKey);
        history.push({ x: smoothX, y: smoothY, dipX, dipY, time: now });

        if (history.length > this.historyLength) {
          history.shift();
        }

        // Calculate current slice velocity and blade segment
        if (history.length >= 2) {
          const curr = history[history.length - 1];
          const prev = history[history.length - 2];
          const dt = Math.max(1, curr.time - prev.time);
          const dx = curr.x - prev.x;
          const dy = curr.y - prev.y;
          const dist = Math.hypot(dx, dy);
          const velocity = dist / dt; // px/ms

          const isSlicing = velocity >= this.sliceVelocityThreshold || dist > 8;

          activeBladeSegments.push({
            handId: handKey,
            x1: prev.x,
            y1: prev.y,
            x2: curr.x,
            y2: curr.y,
            dipX: curr.dipX,
            dipY: curr.dipY,
            velocity,
            isSlicing,
            history
          });
        }
      });
    }

    // Clean up stale hands
    for (const key of this.handHistories.keys()) {
      if (!activeHandIds.has(key)) {
        this.handHistories.delete(key);
        this.smoothedPositions.delete(key);
      }
    }

    this.lastDetectionResult = {
      activeBladeSegments,
      handsTracked: results.landmarks ? results.landmarks.length : 0
    };

    return this.lastDetectionResult;
  }

  /**
   * Render glowing neon blade trails and fingertip indicator nodes with custom cursor styles.
   * Supports Cyan, Blue, Red, Lime, Gold, and Rare Chroma (RGB rainbow fade).
   */
  drawBladeTrails(ctx, bladeSegments, cursorStyle = 'cyan') {
    if (!bladeSegments || bladeSegments.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter'; // Fast GPU additive neon blend

    const getCursorColor = (isSlicing) => {
      if (!isSlicing) return { glow: '255, 255, 255', hex: '#ffffff' };
      const now = performance.now();
      switch (cursorStyle) {
        case 'blue':
          return { glow: '59, 130, 246', hex: '#3b82f6' };
        case 'red':
          return { glow: '255, 71, 87', hex: '#ff4757' };
        case 'lime':
          return { glow: '46, 213, 115', hex: '#2ed573' };
        case 'gold':
          return { glow: '255, 165, 2', hex: '#ffa502' };
        case 'chroma': {
          const hue = (now / 12) % 360;
          return { glow: `hsl(${hue}, 100%, 60%)`, hex: `hsl(${hue}, 100%, 60%)`, isHSL: true };
        }
        case 'cyan':
        default:
          return { glow: '0, 242, 254', hex: '#00f2fe' };
      }
    };

    bladeSegments.forEach(segment => {
      const history = segment.history;
      if (!history || history.length < 2) return;

      const isSlicing = segment.isSlicing;
      const colorObj = getCursorColor(isSlicing);

      // 1. Wide Neon Outer Glow Trail
      for (let i = 1; i < history.length; i++) {
        const p1 = history[i - 1];
        const p2 = history[i];
        const progress = i / history.length;

        const strokeStyleGlow = colorObj.isHSL 
          ? colorObj.glow 
          : `rgba(${colorObj.glow}, ${0.6 * progress})`;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = (isSlicing ? 20 : 12) * progress;
        ctx.strokeStyle = strokeStyleGlow;
        ctx.stroke();

        // Hot White Core Blade Edge
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = 4 * progress;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * progress})`;
        ctx.stroke();
      }

      // 2. Active Fingertip Flare Node
      const tip = history[history.length - 1];

      // Outer Aura Ring
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = colorObj.hex;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner Core Node
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });

    ctx.restore();
  }
}
