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
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          this.isReady = true;
          resolve(this.video);
        };
      });
    } catch (err) {
      this.isReady = false;
      throw err;
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
