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
      numHands: 2,
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
    const rawHandLandmarks = [];

    if (results.landmarks && results.landmarks.length > 0) {
      results.landmarks.forEach((handLandmarks, handIndex) => {
        // Convert all 21 3D landmarks to mirrored canvas space for exoskeleton rendering
        const canvasLandmarks = handLandmarks.map((lm) => ({
          x: (1 - lm.x) * canvasWidth,
          y: lm.y * canvasHeight,
          z: lm.z
        }));
        rawHandLandmarks.push(canvasLandmarks);

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
        const handednessLabel = (results.handedness && results.handedness[handIndex] && results.handedness[handIndex][0])
          ? results.handedness[handIndex][0].categoryName
          : `hand_${handIndex}`;
        const handKey = `hand_${handednessLabel}`;
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
      rawHandLandmarks,
      handsTracked: results.landmarks ? results.landmarks.length : 0
    };

    return this.lastDetectionResult;
  }

  /**
   * Render AI Hand Exoskeleton filter matching 21 MediaPipe hand landmarks and bone connections.
   * Purely visual feature - supports green, red, yellow, chroma, and goth monochrome skins.
   */
  drawHandExoskeleton(ctx, rawHandLandmarks, equippedSkin = 'green') {
    if (!rawHandLandmarks || rawHandLandmarks.length === 0) return;

    const HAND_CONNECTIONS = [
      // Wrist to finger bases
      [0, 1], [0, 5], [0, 9], [0, 13], [0, 17],
      // Palm cross-connections (MCP joints)
      [5, 9], [9, 13], [13, 17],
      // Thumb
      [1, 2], [2, 3], [3, 4],
      // Index finger
      [5, 6], [6, 7], [7, 8],
      // Middle finger
      [9, 10], [10, 11], [11, 12],
      // Ring finger
      [13, 14], [14, 15], [15, 16],
      // Pinky finger
      [17, 18], [18, 19], [19, 20]
    ];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getSkinColors = (skin) => {
      const now = performance.now();
      switch (skin) {
        case 'red':
          return { line: '#ff4757', glow: 'rgba(255, 71, 87, 0.6)', joint: '#ffffff', jointBorder: '#ff4757' };
        case 'yellow':
          return { line: '#ffa502', glow: 'rgba(255, 165, 2, 0.6)', joint: '#ffffff', jointBorder: '#ffa502' };
        case 'chroma': {
          const hue = (now / 10) % 360;
          const color = `hsl(${hue}, 100%, 60%)`;
          return { line: color, glow: color, joint: '#ffffff', jointBorder: color };
        }
        case 'goth':
        case 'white':
          return { line: '#ffffff', glow: 'rgba(255, 255, 255, 0.4)', joint: '#05070c', jointBorder: '#ffffff' };
        case 'green':
        default:
          return { line: '#2ed573', glow: 'rgba(46, 213, 115, 0.6)', joint: '#ffffff', jointBorder: '#2ed573' };
      }
    };

    const colors = getSkinColors(equippedSkin);

    rawHandLandmarks.forEach((landmarks) => {
      if (!landmarks || landmarks.length < 21) return;

      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 3.5;

      // 1. Draw Palm & Finger Hand Skeleton (21 MediaPipe Landmarks)
      HAND_CONNECTIONS.forEach(([i, j]) => {
        const p1 = landmarks[i];
        const p2 = landmarks[j];
        if (!p1 || !p2) return;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      // 2. Compute Forearm & Bicep Extended Skeletal Mesh
      const wrist = landmarks[0];
      const middleMCP = landmarks[9];
      const indexMCP = landmarks[5];
      const pinkyMCP = landmarks[17];
      const middleTip = landmarks[12];

      const handLen = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) || 120;
      const fwdDx = middleMCP.x - wrist.x;
      const fwdDy = middleMCP.y - wrist.y;
      const fwdDist = Math.hypot(fwdDx, fwdDy) || 1;
      const fwdX = fwdDx / fwdDist;
      const fwdY = fwdDy / fwdDist;

      // Backward Arm Direction Vector (from wrist down arm)
      const armX = -fwdX;
      const armY = -fwdY;

      // Perpendicular Side Vector
      const sideX = -armY;
      const sideY = armX;

      // Dimensions
      const forearmLen = handLen * 1.45;
      const bicepLen = handLen * 1.35;
      const wWidth = Math.hypot(pinkyMCP.x - indexMCP.x, pinkyMCP.y - indexMCP.y) * 0.45;
      const eWidth = wWidth * 1.35;
      const sWidth = eWidth * 1.4;

      // Key Joints
      const elbowX = wrist.x + armX * forearmLen;
      const elbowY = wrist.y + armY * forearmLen;

      const shoulderX = elbowX + armX * bicepLen;
      const shoulderY = elbowY + armY * bicepLen;

      // Rail Anchors
      const wLeft = { x: wrist.x + sideX * wWidth, y: wrist.y + sideY * wWidth };
      const wRight = { x: wrist.x - sideX * wWidth, y: wrist.y - sideY * wWidth };

      const eLeft = { x: elbowX + sideX * eWidth, y: elbowY + sideY * eWidth };
      const eRight = { x: elbowX - sideX * eWidth, y: elbowY - sideY * eWidth };

      const sLeft = { x: shoulderX + sideX * sWidth, y: shoulderY + sideY * sWidth };
      const sRight = { x: shoulderX - sideX * sWidth, y: shoulderY - sideY * sWidth };

      // Forearm Tech Cross-Rings (at 33% and 66%)
      const r1C = { x: wrist.x + armX * (forearmLen * 0.33), y: wrist.y + armY * (forearmLen * 0.33) };
      const r1W = wWidth + (eWidth - wWidth) * 0.33;
      const r1L = { x: r1C.x + sideX * r1W, y: r1C.y + sideY * r1W };
      const r1R = { x: r1C.x - sideX * r1W, y: r1C.y - sideY * r1W };

      const r2C = { x: wrist.x + armX * (forearmLen * 0.66), y: wrist.y + armY * (forearmLen * 0.66) };
      const r2W = wWidth + (eWidth - wWidth) * 0.66;
      const r2L = { x: r2C.x + sideX * r2W, y: r2C.y + sideY * r2W };
      const r2R = { x: r2C.x - sideX * r2W, y: r2C.y - sideY * r2W };

      // Bicep Muscle Curve Midpoints
      const bMid = { x: elbowX + armX * (bicepLen * 0.5), y: elbowY + armY * (bicepLen * 0.5) };
      const bBulge = sWidth * 1.25;
      const bL = { x: bMid.x + sideX * bBulge, y: bMid.y + sideY * bBulge };
      const bR = { x: bMid.x - sideX * bBulge, y: bMid.y - sideY * bBulge };

      // --- Draw Forearm Cyber Bones (Dual Rails + Center Marrow + Cross-Rings) ---
      // Left Forearm Rail
      ctx.beginPath();
      ctx.moveTo(wLeft.x, wLeft.y);
      ctx.lineTo(r1L.x, r1L.y);
      ctx.lineTo(r2L.x, r2L.y);
      ctx.lineTo(eLeft.x, eLeft.y);
      ctx.stroke();

      // Right Forearm Rail
      ctx.beginPath();
      ctx.moveTo(wRight.x, wRight.y);
      ctx.lineTo(r1R.x, r1R.y);
      ctx.lineTo(r2R.x, r2R.y);
      ctx.lineTo(eRight.x, eRight.y);
      ctx.stroke();

      // Center Forearm Spine
      ctx.beginPath();
      ctx.moveTo(wrist.x, wrist.y);
      ctx.lineTo(elbowX, elbowY);
      ctx.stroke();

      // Forearm Tech Cross-Rings
      ctx.beginPath();
      ctx.moveTo(r1L.x, r1L.y); ctx.lineTo(r1R.x, r1R.y);
      ctx.moveTo(r2L.x, r2L.y); ctx.lineTo(r2R.x, r2R.y);
      ctx.stroke();

      // --- Draw Bicep Cyber Bones (Muscle Curved Rails + Humerus Spine) ---
      // Outer Bicep Curved Line (Left)
      ctx.beginPath();
      ctx.moveTo(eLeft.x, eLeft.y);
      ctx.quadraticCurveTo(bL.x, bL.y, sLeft.x, sLeft.y);
      ctx.stroke();

      // Outer Bicep Curved Line (Right)
      ctx.beginPath();
      ctx.moveTo(eRight.x, eRight.y);
      ctx.quadraticCurveTo(bR.x, bR.y, sRight.x, sRight.y);
      ctx.stroke();

      // Center Humerus Spine
      ctx.beginPath();
      ctx.moveTo(elbowX, elbowY);
      ctx.lineTo(shoulderX, shoulderY);
      ctx.stroke();

      // Bicep Muscle Mid Cross-Ring
      ctx.beginPath();
      ctx.moveTo(bL.x, bL.y); ctx.lineTo(bR.x, bR.y);
      ctx.stroke();

      // Shoulder Base Bar
      ctx.beginPath();
      ctx.moveTo(sLeft.x, sLeft.y); ctx.lineTo(sRight.x, sRight.y);
      ctx.stroke();

      // 3. Draw Joint Nodes (Fingers + Wrist + Elbow + Shoulder)
      const fingertipIndices = [4, 8, 12, 16, 20];

      // Finger & Palm Joint Nodes
      landmarks.forEach((p, idx) => {
        const isFingertip = fingertipIndices.includes(idx);
        const radius = isFingertip ? 5.5 : 4;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = colors.jointBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFingertip ? colors.line : colors.joint;
        ctx.fill();
      });

      // Forearm & Arm Structural Joint Nodes
      const armNodes = [
        r1L, r1R, r2L, r2R, eLeft, eRight, bL, bR, sLeft, sRight
      ];

      armNodes.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = colors.jointBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = colors.joint;
        ctx.fill();
      });

      // Large Elbow Joint Ring Node
      ctx.beginPath();
      ctx.arc(elbowX, elbowY, 9, 0, Math.PI * 2);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(elbowX, elbowY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Large Shoulder Joint Ring Node
      ctx.beginPath();
      ctx.arc(shoulderX, shoulderY, 11, 0, Math.PI * 2);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(shoulderX, shoulderY, 6, 0, Math.PI * 2);
      ctx.fillStyle = colors.line;
      ctx.fill();
    });

    ctx.restore();
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
