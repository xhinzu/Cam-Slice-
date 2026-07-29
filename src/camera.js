/**
 * Camera Module - Handles webcam stream initialization, video element binding,
 * and permission error callbacks.
 */

export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.isReady = false;
  }

  /**
   * Request webcam access and start playing video.
   */
  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Webcam mediaDevices API is not supported in this browser.');
    }

    try {
      if (this.stream && this.stream.active) {
        const videoTracks = this.stream.getVideoTracks();
        if (videoTracks.length > 0 && videoTracks[0].readyState === 'live') {
          this.video.srcObject = this.stream;
          await this.video.play().catch(() => {});
          this.isReady = true;
          return this.video;
        }
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: 'user'
        },
        audio: false
      });

      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play().catch(() => {});
          this.isReady = true;
          resolve(this.video);
        };
      });
    } catch (err) {
      this.isReady = false;
      throw err;
    }
  }

  async ensureActiveStream() {
    const videoTracks = this.stream ? this.stream.getVideoTracks() : [];
    if (!this.stream || !this.stream.active || videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      try {
        await this.startCamera();
      } catch (e) {}
    } else if (this.video.paused || this.video.ended) {
      this.video.play().catch(() => {});
    }
  }

  /**
   * Stop video stream.
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
      this.isReady = false;
    }
  }

  /**
   * Get exact resolution dimensions of active webcam feed.
   */
  getDimensions() {
    return {
      width: this.video.videoWidth || 1280,
      height: this.video.videoHeight || 720
    };
  }
}
