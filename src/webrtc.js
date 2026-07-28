/**
 * WebRTC Mesh Manager - Direct Peer-to-Peer Video/Audio Mesh between room players.
 * Routes signaling (Offers, Answers, ICE Candidates) via PartyKit socket connection.
 */

export class WebRTCManager {
  constructor(options = {}) {
    this.sendSignal = options.sendSignal || (() => {});
    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onRemoteStreamEnded = options.onRemoteStreamEnded || (() => {});

    this.localStream = null;
    this.peerConnections = new Map(); // peerId -> RTCPeerConnection
    this.remoteStreams = new Map(); // peerId -> MediaStream

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }

  setLocalStream(stream) {
    this.localStream = stream;
  }

  /**
   * Determine if device should support WebRTC Mesh POV (PC/Desktop only).
   */
  static isSupportedOnDevice() {
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    const isSmallViewport = window.innerWidth <= 768;
    return !isMobileUserAgent && !isSmallViewport;
  }

  /**
   * Initialize P2P connection to a remote peer (caller/initiator creates offer).
   */
  async createPeerConnection(peerId, isInitiator) {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId);
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(peerId, pc);

    // Add local tracks if webcam stream exists
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, {
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    // Remote Track received
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(peerId, stream);
      this.onRemoteStream(peerId, stream);
    };

    pc.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        this.closePeer(peerId);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignal(peerId, {
          type: 'offer',
          sdp: offer
        });
      } catch (err) {
        console.error(`WebRTC offer creation error for peer ${peerId}:`, err);
      }
    }

    return pc;
  }

  /**
   * Handle incoming WebRTC signaling payload from a remote peer.
   */
  async handleSignal(peerId, signalData) {
    if (!signalData) return;

    let pc = this.peerConnections.get(peerId);

    if (signalData.type === 'offer') {
      if (!pc) {
        pc = await this.createPeerConnection(peerId, false);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal(peerId, {
        type: 'answer',
        sdp: answer
      });
    } else if (signalData.type === 'answer') {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      }
    } else if (signalData.type === 'candidate') {
      if (pc && signalData.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (e) {
          console.warn('Error adding ICE candidate:', e);
        }
      }
    }
  }

  /**
   * Connect to all peers in the room mesh.
   */
  syncMeshPeers(myId, peerIds) {
    // Close connections to peers who left
    for (const [peerId] of this.peerConnections) {
      if (!peerIds.includes(peerId)) {
        this.closePeer(peerId);
      }
    }

    // For any peer with a lexically greater ID, initiate connection (avoids duplicate offers)
    for (const peerId of peerIds) {
      if (peerId !== myId && !this.peerConnections.has(peerId)) {
        const isInitiator = myId < peerId;
        this.createPeerConnection(peerId, isInitiator);
      }
    }
  }

  closePeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    this.onRemoteStreamEnded(peerId);
  }

  closeAll() {
    for (const [peerId, pc] of this.peerConnections) {
      pc.close();
      this.onRemoteStreamEnded(peerId);
    }
    this.peerConnections.clear();
    this.remoteStreams.clear();
  }
}
