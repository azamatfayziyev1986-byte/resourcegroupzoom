// WebRTC & Media Stream Manager
class WebRTCManager {
  constructor(socketManager) {
    this.socket = socketManager;
    this.localStream = null;
    this.screenStream = null;
    this.peers = {}; // peerId -> RTCPeerConnection
    this.remoteStreams = {}; // peerId -> MediaStream (combines audio & video tracks)
    this.audioContext = null;
    this.analyser = null;
    this.isMuted = false;
    this.isVideoOff = false;
    this.isScreenSharing = false;
    this.currentFacingMode = "user";

    this.rtcConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:stun.relay.metered.ca:80" },
        {
          urls: "turn:standard.relay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:standard.relay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:standard.relay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ],
      iceCandidatePoolSize: 10
    };
  }

  async initLocalMedia(previewOnly = false) {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const videoConstraints = isMobile
      ? { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, facingMode: { ideal: this.currentFacingMode || "user" } }
      : { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } };

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: true
      });
      this.isVideoOff = false;
      this.isMuted = false;
    } catch (err1) {
      console.warn("Standard getUserMedia failed, trying relaxed constraints:", err1);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.isVideoOff = false;
        this.isMuted = false;
      } catch (err2) {
        console.warn("Camera failed, trying audio-only:", err2);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          this.isVideoOff = true;
          this.isMuted = false;
        } catch (err3) {
          console.warn("No mic or camera access:", err3);
          stream = new MediaStream();
          this.isVideoOff = true;
          this.isMuted = true;
        }
      }
    }

    this.localStream = stream;
    this.setupAudioMeter(this.localStream);
    this.attachLocalStreamToPeers();
    return this.localStream;
  }

  attachLocalStreamToPeers() {
    if (!this.localStream) return;
    for (const pid in this.peers) {
      const pc = this.peers[pid];
      const senders = pc.getSenders();
      this.localStream.getTracks().forEach(track => {
        const existing = senders.find(s => s.track && s.track.kind === track.kind);
        if (existing) {
          existing.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, this.localStream);
          } catch (e) {
            console.warn("Failed to add track to peer:", e);
          }
        }
      });
    }
  }

  setupAudioMeter(stream) {
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!this.analyser || this.isMuted) {
          window.dispatchEvent(new CustomEvent("local-volume", { detail: { volume: 0 } }));
        } else {
          this.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          window.dispatchEvent(new CustomEvent("local-volume", { detail: { volume: avg } }));
        }
        requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (e) {
      console.warn("Audio meter setup error:", e);
    }
  }

  createPeerConnection(peerId, isInitiator = false) {
    if (this.peers[peerId]) return this.peers[peerId];

    console.log(`[WebRTC] Creating RTCPeerConnection for ${peerId}, isInitiator=${isInitiator}`);
    const pc = new RTCPeerConnection(this.rtcConfig);
    pc.candidateQueue = [];
    this.peers[peerId] = pc;

    // Negotiation handler: only INITIATOR creates offers to avoid offer collisions
    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        if (pc.signalingState !== "stable") return;
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);
        this.socket.send({
          action: "signal",
          target: peerId,
          signal: { type: "offer", sdp: pc.localDescription }
        });
        console.log(`[WebRTC] Sent negotiation offer to ${peerId}`);
      } catch (err) {
        console.error("Negotiation error:", err);
      }
    };

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, this.localStream);
        } catch (e) {
          console.warn("Failed to add track:", e);
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.send({
          action: "signal",
          target: peerId,
          signal: { type: "candidate", candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${peerId}:`, event.track.kind);
      if (!this.remoteStreams[peerId]) {
        this.remoteStreams[peerId] = new MediaStream();
      }
      const remoteStream = this.remoteStreams[peerId];

      if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(t => {
          if (!remoteStream.getTracks().some(existing => existing.id === t.id)) {
            remoteStream.addTrack(t);
          }
        });
      }

      event.track.onended = () => {
        try { remoteStream.removeTrack(event.track); } catch (e) {}
      };

      window.dispatchEvent(new CustomEvent("remote-track", {
        detail: { peerId: peerId, stream: remoteStream, track: event.track }
      }));
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerId}:`, pc.connectionState);
      if (pc.connectionState === "failed") {
        console.warn(`[WebRTC] Connection with ${peerId} failed, attempting ICE restart...`);
        try {
          if (pc.restartIce) {
            pc.restartIce();
          }
        } catch (e) {}
      }
    };

    // If initiator, explicitly trigger an offer
    if (isInitiator) {
      setTimeout(async () => {
        try {
          if (pc.signalingState === "stable") {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);
            this.socket.send({
              action: "signal",
              target: peerId,
              signal: { type: "offer", sdp: pc.localDescription }
            });
            console.log(`[WebRTC] Sent initial offer to ${peerId}`);
          }
        } catch (err) {
          console.error("Direct offer error:", err);
        }
      }, 50);
    }

    return pc;
  }

  async handleSignal(senderId, signal) {
    let pc = this.peers[senderId];
    if (!pc) {
      pc = this.createPeerConnection(senderId, false);
    }

    if (signal.type === "offer") {
      try {
        console.log(`[WebRTC] Handling offer from ${senderId}`);
        // Handle Glare: if we already made an offer, rollback to accept the incoming offer
        if (pc.signalingState !== "stable") {
          console.warn(`[WebRTC] Glare detected with ${senderId}! Rolling back local offer.`);
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch (rbe) {}
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        
        // Flush any queued ICE candidates
        if (pc.candidateQueue && pc.candidateQueue.length > 0) {
          for (const cand of pc.candidateQueue) {
            try {
              await pc.addIceCandidate(cand);
            } catch (ce) {}
          }
          pc.candidateQueue = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket.send({
          action: "signal",
          target: senderId,
          signal: { type: "answer", sdp: pc.localDescription }
        });
        console.log(`[WebRTC] Sent answer to ${senderId}`);
      } catch (err) {
        console.error("Error handling offer:", err);
      }
    } else if (signal.type === "answer") {
      try {
        console.log(`[WebRTC] Handling answer from ${senderId}`);
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }

        // Flush any queued ICE candidates
        if (pc.candidateQueue && pc.candidateQueue.length > 0) {
          for (const cand of pc.candidateQueue) {
            try {
              await pc.addIceCandidate(cand);
            } catch (ce) {}
          }
          pc.candidateQueue = [];
        }
      } catch (err) {
        console.error("Error handling answer:", err);
      }
    } else if (signal.type === "candidate") {
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        pc.candidateQueue = pc.candidateQueue || [];
        pc.candidateQueue.push(signal.candidate);
      } else {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (e) {
          console.warn("Failed to add ICE candidate:", e);
        }
      }
    }
  }

  async startScreenShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert("Kechirasiz, ushbu qurilmada ekran ulashish qo'llab-quvvatlanmaydi.");
      return null;
    }
    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const displayConstraints = isMobile ? { video: true } : { video: { cursor: "always" }, audio: true };
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);

      const videoTrack = this.screenStream.getVideoTracks()[0];
      
      // Replace video track in peer connections
      for (const pid in this.peers) {
        const pc = this.peers[pid];
        const senders = pc.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      }

      this.isScreenSharing = true;

      videoTrack.onended = () => {
        this.stopScreenShare();
      };

      return this.screenStream;
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
      return null;
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    if (this.localStream) {
      const localVideoTrack = this.localStream.getVideoTracks()[0];
      if (localVideoTrack) {
        for (const pid in this.peers) {
          const pc = this.peers[pid];
          const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
          if (sender) {
            sender.replaceTrack(localVideoTrack);
          }
        }
      }
    }

    this.isScreenSharing = false;
    window.dispatchEvent(new CustomEvent("screen-share-stopped"));
  }

  async switchCamera(deviceIdOrFlip = null) {
    if (!this.localStream) return false;

    let videoConstraints = {};
    if (typeof deviceIdOrFlip === "string" && deviceIdOrFlip) {
      videoConstraints = { deviceId: { exact: deviceIdOrFlip } };
    } else {
      this.currentFacingMode = this.currentFacingMode === "environment" ? "user" : "environment";
      videoConstraints = {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 }
      };
    }

    const oldVideoTrack = this.localStream.getVideoTracks()[0];
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (newTrack) {
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localStream.addTrack(newTrack);

        const localVideo = document.getElementById("local-video");
        const localAvatar = document.getElementById("local-avatar");
        if (localAvatar) {
          localAvatar.style.display = "none";
          localAvatar.classList.add("hidden");
        }
        if (localVideo) {
          localVideo.style.display = "block";
          localVideo.classList.remove("hidden");
          localVideo.muted = true;
          localVideo.defaultMuted = true;
          localVideo.playsInline = true;
          localVideo.setAttribute("playsinline", "");
          localVideo.setAttribute("webkit-playsinline", "");
          localVideo.setAttribute("muted", "");
          localVideo.setAttribute("autoplay", "");
          localVideo.style.transform = this.currentFacingMode === "environment" ? "none" : "scaleX(-1)";
          localVideo.srcObject = this.localStream;
          localVideo.play().catch(() => {});
        }

        // Replace track across all peer connections
        for (const pid in this.peers) {
          const pc = this.peers[pid];
          const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
          if (sender) {
            await sender.replaceTrack(newTrack).catch(e => console.warn("replaceTrack error:", e));
          }
        }
        return true;
      }
    } catch (e) {
      console.warn("switchCamera error:", e);
      return false;
    }
    return false;
  }

  async switchMicrophone(deviceId) {
    try {
      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (this.localStream) {
        const oldTrack = this.localStream.getAudioTracks()[0];
        if (oldTrack) {
          this.localStream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        this.localStream.addTrack(newAudioTrack);
      } else {
        this.localStream = newStream;
      }

      // Replace track across all peer connections
      for (const pid in this.peers) {
        const pc = this.peers[pid];
        const sender = pc.getSenders().find(s => s.track && s.track.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        }
      }

      this.setupAudioMeter(this.localStream);
      return true;
    } catch (e) {
      console.error("switchMicrophone error:", e);
      return false;
    }
  }

  playTestSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn("Sound test warning:", e);
    }
  }

  toggleAudio(forceState = null) {
    if (!this.localStream) return false;
    const track = this.localStream.getAudioTracks()[0];
    if (track) {
      this.isMuted = forceState !== null ? !forceState : !this.isMuted;
      track.enabled = !this.isMuted;
      return !this.isMuted;
    }
    return false;
  }

  toggleVideo(forceState = null) {
    if (!this.localStream) return false;
    const track = this.localStream.getVideoTracks()[0];
    if (track) {
      this.isVideoOff = forceState !== null ? !forceState : !this.isVideoOff;
      track.enabled = !this.isVideoOff;
      return !this.isVideoOff;
    }
    return false;
  }

  async applyVirtualBackground(bgType) {
    this.activeVirtualBg = bgType;
    if (!this.bgProcessor) {
      this.bgProcessor = new MediaPipeBackgroundProcessor();
    }

    if (bgType === "none") {
      this.bgProcessor.stop();
      const rawTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
      if (rawTrack) {
        for (const pid in this.peers) {
          const pc = this.peers[pid];
          const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
          if (sender) await sender.replaceTrack(rawTrack).catch(() => {});
        }
      }
      return this.localStream;
    } else {
      const processedStream = await this.bgProcessor.start(this.localStream, bgType);
      if (processedStream) {
        const processedTrack = processedStream.getVideoTracks()[0];
        if (processedTrack) {
          for (const pid in this.peers) {
            const pc = this.peers[pid];
            const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) await sender.replaceTrack(processedTrack).catch(() => {});
          }
        }
      }
      return processedStream;
    }
  }

  toggleNoiseSuppression(enabled) {
    this.isNoiseSuppressionOn = enabled;
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track && track.applyConstraints) {
        track.applyConstraints({
          noiseSuppression: enabled,
          echoCancellation: true,
          autoGainControl: true
        }).catch(e => console.warn("applyConstraints noise warning:", e));
      }
    }
    return this.isNoiseSuppressionOn;
  }

  toggleStudioAudio(enabled) {
    this.isStudioAudioOn = enabled;
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track && track.applyConstraints) {
        track.applyConstraints(enabled ? {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2
        } : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }).catch(e => console.warn("applyConstraints studio warning:", e));
      }
    }
    return this.isStudioAudioOn;
  }

  setLowBandwidthMode(enabled) {
    this.isLowBandwidth = enabled;
    for (const pid in this.peers) {
      const pc = this.peers[pid];
      const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
      if (sender && sender.getParameters) {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (enabled) {
            params.encodings[0].maxBitrate = 150000;
            params.encodings[0].maxFramerate = 15;
          } else {
            params.encodings[0].maxBitrate = 1500000;
            params.encodings[0].maxFramerate = 30;
          }
          sender.setParameters(params).catch(() => {});
        } catch (e) {}
      }
    }
    return this.isLowBandwidth;
  }

  closePeer(peerId) {
    if (this.peers[peerId]) {
      this.peers[peerId].close();
      delete this.peers[peerId];
    }
    if (this.remoteStreams && this.remoteStreams[peerId]) {
      delete this.remoteStreams[peerId];
    }
  }

  closeAll() {
    this.stopScreenShare();
    if (this.bgProcessor) {
      this.bgProcessor.stop();
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    for (const pid in this.peers) {
      this.peers[pid].close();
    }
    this.peers = {};
    this.remoteStreams = {};
  }
}

// MediaPipe AI Person Segmentation & Virtual Background Engine
class MediaPipeBackgroundProcessor {
  constructor() {
    this.canvas = document.getElementById("segmented-bg-canvas") || document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext("2d");
    this.currentMode = "none";
    this.isRunning = false;

    // Offscreen rendering layers for razor-sharp edge anti-aliasing
    this.maskCanvas = document.createElement("canvas");
    this.maskCtx = this.maskCanvas.getContext("2d");
    this.personCanvas = document.createElement("canvas");
    this.personCtx = this.personCanvas.getContext("2d");

    this.sourceVideo = document.createElement("video");
    this.sourceVideo.autoplay = true;
    this.sourceVideo.muted = true;
    this.sourceVideo.playsInline = true;
    this.segmenter = null;
    this.bgImages = {};
    this.initBackgroundImages();
    this.initSegmenter();
  }

  initBackgroundImages() {
    const list = {
      office: "/images/backgrounds/office.jpg",
      boardroom: "/images/backgrounds/boardroom.jpg",
      library: "/images/backgrounds/library.jpg",
      loft: "/images/backgrounds/loft.jpg",
      nature: "/images/backgrounds/nature.jpg",
      cyber: "/images/backgrounds/cyber.jpg"
    };

    for (const key in list) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = list[key];
      this.bgImages[key] = img;
    }
  }

  initSegmenter() {
    if (window.SelfieSegmentation) {
      try {
        this.segmenter = new SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });
        this.segmenter.setOptions({
          modelSelection: 1, // Landscape model for high accuracy
          selfieMode: false
        });
        this.segmenter.onResults((results) => this.onResults(results));
        console.log("[MediaPipe] Selfie Segmentation initialized successfully!");
      } catch (e) {
        console.warn("[MediaPipe] Init error:", e);
      }
    }
  }

  async start(rawStream, mode) {
    this.currentMode = mode;
    if (mode === "none") {
      this.stop();
      return null;
    }

    if (!this.segmenter) {
      this.initSegmenter();
    }

    this.sourceVideo.srcObject = rawStream;
    await this.sourceVideo.play().catch(e => console.warn("Source video play error:", e));

    const w = this.sourceVideo.videoWidth || 1280;
    const h = this.sourceVideo.videoHeight || 720;
    this.canvas.width = w;
    this.canvas.height = h;
    this.maskCanvas.width = w;
    this.maskCanvas.height = h;
    this.personCanvas.width = w;
    this.personCanvas.height = h;

    this.isRunning = true;
    this.processFrameLoop();

    return this.canvas.captureStream(30);
  }

  stop() {
    this.isRunning = false;
    this.currentMode = "none";
    if (this.sourceVideo.srcObject) {
      this.sourceVideo.srcObject = null;
    }
  }

  async processFrameLoop() {
    if (!this.isRunning) return;

    if (this.sourceVideo && this.sourceVideo.readyState >= 2) {
      if (this.segmenter) {
        try {
          await this.segmenter.send({ image: this.sourceVideo });
        } catch (e) {
          this.fallbackRender();
        }
      } else {
        this.fallbackRender();
      }
    }

    if (this.isRunning) {
      requestAnimationFrame(() => this.processFrameLoop());
    }
  }

  fallbackRender() {
    if (!this.ctx || !this.sourceVideo) return;
    this.ctx.drawImage(this.sourceVideo, 0, 0, this.canvas.width, this.canvas.height);
  }

  drawCoverImage(ctx, img, w, h) {
    if (!img || !img.complete || img.naturalWidth === 0) {
      // Fallback gradient while loading
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#1e293b");
      grad.addColorStop(1, "#0f172a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const hRatio = w / nw;
    const vRatio = h / nh;
    const ratio = Math.max(hRatio, vRatio);
    const centerShiftX = (w - nw * ratio) / 2;
    const centerShiftY = (h - nh * ratio) / 2;
    ctx.drawImage(img, 0, 0, nw, nh, centerShiftX, centerShiftY, nw * ratio, nh * ratio);
  }

  onResults(results) {
    if (!this.isRunning || !this.ctx) return;

    const w = this.sourceVideo.videoWidth || 1280;
    const h = this.sourceVideo.videoHeight || 720;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.maskCanvas.width = w;
      this.maskCanvas.height = h;
      this.personCanvas.width = w;
      this.personCanvas.height = h;
    }

    // 1. Mask Conditioning & Anti-aliased Feathering (removes pixel stair-steps & eliminates background light halo)
    this.maskCtx.save();
    this.maskCtx.clearRect(0, 0, w, h);
    this.maskCtx.imageSmoothingEnabled = true;
    this.maskCtx.imageSmoothingQuality = "high";
    this.maskCtx.filter = "blur(2.5px) contrast(135%) brightness(95%)";
    this.maskCtx.drawImage(results.segmentationMask, 0, 0, w, h);
    this.maskCtx.restore();

    // 2. Crisp Person Extraction on Offscreen Canvas
    this.personCtx.save();
    this.personCtx.clearRect(0, 0, w, h);
    this.personCtx.imageSmoothingEnabled = true;
    this.personCtx.imageSmoothingQuality = "high";
    this.personCtx.drawImage(this.maskCanvas, 0, 0, w, h);
    this.personCtx.globalCompositeOperation = "source-in";
    this.personCtx.drawImage(results.image, 0, 0, w, h);
    this.personCtx.restore();

    // 3. Composite Final Image onto Main Output Canvas
    this.ctx.save();
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    if (this.currentMode === "blur") {
      // High-quality modern cinematic bokeh blur
      this.ctx.save();
      this.ctx.filter = "blur(18px) saturate(115%)";
      this.ctx.drawImage(results.image, -10, -10, w + 20, h + 20);
      this.ctx.restore();
    } else if (this.bgImages[this.currentMode]) {
      // Photorealistic virtual background with cover ratio
      this.drawCoverImage(this.ctx, this.bgImages[this.currentMode], w, h);
    } else {
      this.ctx.drawImage(results.image, 0, 0, w, h);
    }

    // Draw the clean, antialiased person on top
    this.ctx.drawImage(this.personCanvas, 0, 0, w, h);
    this.ctx.restore();
  }
}
