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
    
    // Blade configuration
    this.historyLength = 10;
    this.sliceVelocityThreshold = 0.35; // Lower velocity threshold (px/ms) for responsive slicing
  }

  /**
   * Load MediaPipe Vision tasks WASM and initialize HandLandmarker model.
   */
  async initialize(onProgress = () => {}) {
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
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3
    });

    this.isLoaded = true;
    onProgress('Hand Tracking System Ready!');
  }

  /**
   * Process a single video frame and return blade motion data.
   */
  detectHands(videoElement, timestamp, canvasWidth, canvasHeight) {
    if (!this.isLoaded || !this.handLandmarker || !videoElement || videoElement.videoWidth === 0) {
      return { activeBladeSegments: [], handsTracked: 0 };
    }

    const results = this.handLandmarker.detectForVideo(videoElement, timestamp);
    const activeBladeSegments = [];
    const activeHandIds = new Set();

    if (results.landmarks && results.landmarks.length > 0) {
      results.landmarks.forEach((handLandmarks, handIndex) => {
        // Track Index Fingertip (8), Index DIP (7), Index PIP (6), and Middle Fingertip (12)
        const indexTip = handLandmarks[8];
        const indexDip = handLandmarks[7];
        const middleTip = handLandmarks[12];
        if (!indexTip) return;

        // Convert coordinates to horizontally mirrored canvas space
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

        // Exponential smoothing (EMA) to eliminate jitter while keeping ultra-low latency
        let smoothX = rawX;
        let smoothY = rawY;
        if (this.smoothedPositions.has(handKey)) {
          const prev = this.smoothedPositions.get(handKey);
          const alpha = 0.75; // 75% raw, 25% previous
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
            // Include finger joint segment (dip -> tip) to widen hit precision
            dipX: curr.dipX,
            dipY: curr.dipY,
            velocity,
            isSlicing,
            history: [...history]
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

    return {
      activeBladeSegments,
      handsTracked: results.landmarks ? results.landmarks.length : 0
    };
  }

  /**
   * Render glowing neon blade trails and fingertip indicator nodes.
   */
  drawBladeTrails(ctx, bladeSegments) {
    if (!bladeSegments || bladeSegments.length === 0) return;

    bladeSegments.forEach(segment => {
      const history = segment.history;
      if (!history || history.length < 2) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw multi-layered glowing neon trail
      for (let i = 1; i < history.length; i++) {
        const p1 = history[i - 1];
        const p2 = history[i];
        const progress = i / history.length;

        // Outer Neon Glow
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = 16 * progress;
        ctx.strokeStyle = segment.isSlicing 
          ? `rgba(0, 242, 254, ${0.85 * progress})` 
          : `rgba(255, 255, 255, ${0.4 * progress})`;
        ctx.shadowColor = segment.isSlicing ? '#00f2fe' : '#ffffff';
        ctx.shadowBlur = 20;
        ctx.stroke();

        // Inner Core White Hot Blade Edge
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = 5 * progress;
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 * progress})`;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }

      // Active Fingertip Indicator Flare & Ring
      const tip = history[history.length - 1];

      // Outer Pulsing Aura Ring
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 15;
      ctx.stroke();

      // Core Fingertip Node
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 25;
      ctx.fill();

      ctx.restore();
    });
  }
}
