/**
 * Voice Chat Manager - Handles Always-On Open Mic capture, Web Audio API VAD
 * (Voice Activity Detection / Speaking level monitoring), microphone mute controls,
 * and remote peer audio playback element management.
 */

export class VoiceChatManager {
  constructor(options = {}) {
    this.onSpeakingChange = options.onSpeakingChange || (() => {});
    this.onMicStateChange = options.onMicStateChange || (() => {});

    this.audioStream = null;
    this.audioTrack = null;
    this.isMuted = false;
    this.voiceEnabled = true;
    this.isSpeaking = false;

    // Web Audio API VAD
    this.audioCtx = null;
    this.analyser = null;
    this.microphoneSource = null;
    this.vadInterval = null;
    this.speakingThreshold = 18; // RMS volume threshold for speaking detection

    // Remote peer audio elements map: peerId -> HTMLAudioElement
    this.remoteAudioElements = new Map();
  }

  /**
   * Request microphone stream with built-in echo cancellation, noise suppression & auto gain.
   */
  async startMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Microphone mediaDevices API not supported');
      return null;
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      const tracks = this.audioStream.getAudioTracks();
      if (tracks.length > 0) {
        this.audioTrack = tracks[0];
        this.audioTrack.enabled = !this.isMuted;
        this.initVAD();
      }

      this.onMicStateChange(this.isMuted);
      return this.audioStream;
    } catch (err) {
      console.warn('Microphone access denied or error:', err);
      this.audioStream = null;
      this.audioTrack = null;
      return null;
    }
  }

  /**
   * Initialize Web Audio API Analyser for live Voice Activity Detection (VAD).
   */
  initVAD() {
    if (!this.audioStream) return;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioCtx = new AudioCtxClass();
      this.microphoneSource = this.audioCtx.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;

      this.microphoneSource.connect(this.analyser);
      this.startVADLoop();
    } catch (e) {
      console.warn('VAD initialization notice:', e);
    }
  }

  startVADLoop() {
    this.stopVADLoop();
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.vadInterval = setInterval(() => {
      if (this.isMuted || !this.audioTrack || !this.audioTrack.enabled) {
        if (this.isSpeaking) {
          this.isSpeaking = false;
          this.onSpeakingChange(false);
        }
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const currentlySpeaking = average > this.speakingThreshold;

      if (currentlySpeaking !== this.isSpeaking) {
        this.isSpeaking = currentlySpeaking;
        this.onSpeakingChange(currentlySpeaking);
      }
    }, 120);
  }

  stopVADLoop() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
  }

  /**
   * Toggle Mute/Unmute for local microphone.
   */
  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.audioTrack) {
      this.audioTrack.enabled = !this.isMuted;
    }
    if (this.isMuted && this.isSpeaking) {
      this.isSpeaking = false;
      this.onSpeakingChange(false);
    }
    this.onMicStateChange(this.isMuted);
  }

  /**
   * Get active audio track for combining with video stream.
   */
  getAudioTrack() {
    return (this.audioTrack && this.audioTrack.readyState === 'live') ? this.audioTrack : null;
  }

  /**
   * Attach and play remote peer audio stream via dedicated HTML5 Audio element.
   */
  attachRemoteAudioStream(peerId, stream) {
    if (!peerId || !stream) return;

    const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
    if (audioTracks.length === 0) return;

    let audioEl = this.remoteAudioElements.get(peerId);

    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `remote-audio-${peerId}`;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      this.remoteAudioElements.set(peerId, audioEl);
    }

    const audioStream = new MediaStream(audioTracks);
    audioEl.srcObject = audioStream;

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn(`Autoplay restriction for peer ${peerId} audio, retrying on user click:`, err);
        const resumeOnUserGesture = () => {
          audioEl.play().catch(() => {});
          document.removeEventListener('click', resumeOnUserGesture);
          document.removeEventListener('keydown', resumeOnUserGesture);
        };
        document.addEventListener('click', resumeOnUserGesture);
        document.addEventListener('keydown', resumeOnUserGesture);
      });
    }
  }

  removeRemoteAudio(peerId) {
    const audioEl = this.remoteAudioElements.get(peerId);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
      } catch (e) {}
      this.remoteAudioElements.delete(peerId);
    }
  }

  /**
   * Cleanup and stop microphone stream.
   */
  stopMicrophone() {
    this.stopVADLoop();

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
      this.audioTrack = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
    }

    for (const [peerId] of this.remoteAudioElements) {
      this.removeRemoteAudio(peerId);
    }
  }
}
