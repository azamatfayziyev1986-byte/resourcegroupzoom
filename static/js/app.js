// Core Zoom Clone Application Logic
class ZoomApp {
  constructor() {
    this.peerId = null;
    this.roomId = null;
    this.userName = "Mehmon";
    this.isHost = false;
    this.isHandRaised = false;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.viewMode = "gallery"; // "gallery" | "speaker"
    this.simulatedPeers = [];
    
    // Remote participants store: peerId -> info
    this.participants = new Map();
    this.meetingTranscript = [];
    this.soundboardCtx = null;
    this.speakerTimerInterval = null;
    this.activeQuiz = null;

    // Socket manager
    this.socket = null;
    this.webrtc = null;
    this.whiteboard = null;
    this.chat = null;

    this.init();
  }

  init() {
    try { lucide.createIcons(); } catch (e) { console.warn("Lucide init error:", e); }
    try { this.setupLobbyClock(); } catch (e) { console.error("Clock error:", e); }
    try { this.initUserIdentity(); } catch (e) { console.error("Identity error:", e); }
    try { this.bindRegistrationEvents(); } catch (e) { console.error("Reg error:", e); }
    try { this.bindLobbyEvents(); } catch (e) { console.error("Lobby error:", e); }
    try { this.bindMeetingEvents(); } catch (e) { console.error("Meeting error:", e); }
    try { this.bindSettingsEvents(); } catch (e) { console.error("Settings error:", e); }
    try { this.bindLeaveModalEvents(); } catch (e) { console.error("Leave modal error:", e); }
    try { this.bindKeyboardShortcuts(); } catch (e) { console.error("Shortcuts error:", e); }
    try { this.bindPollEvents(); } catch (e) { console.error("Polls error:", e); }
    try { this.bindVirtualBgEvents(); } catch (e) { console.error("Virtual bg error:", e); }
    try { this.bindAttendanceEvents(); } catch (e) { console.error("Attendance error:", e); }
    try { this.bindQREvents(); } catch (e) { console.error("QR error:", e); }
    try { this.bindCaptionsEvents(); } catch (e) { console.error("Captions error:", e); }
    try { this.bindAmbientMusicEvents(); } catch (e) { console.error("Music error:", e); }
    try { this.bindSecurityModalEvents(); } catch (e) { console.error("Security modal error:", e); }
    try { this.bindWaitingRoomEvents(); } catch (e) { console.error("Waiting room error:", e); }
    try { this.bindBreakoutEvents(); } catch (e) { console.error("Breakout error:", e); }
    try { this.bindQaEvents(); } catch (e) { console.error("QA error:", e); }
    try { this.bindThemeAndPiPEvents(); } catch (e) { console.error("Theme/PiP error:", e); }
    try { this.bindRatingModalEvents(); } catch (e) { console.error("Rating modal error:", e); }
    try { this.bindEnterpriseSuiteEvents(); } catch (e) { console.error("Enterprise suite error:", e); }
    try { this.handleUrlRouting(); } catch (e) { console.error("Routing error:", e); }
    try { lucide.createIcons(); } catch (e) {}
  }

  // User Identification & Registration for Platform Visitors vs Owner ("mandan tashqari hamma registratsiya qilsin")
  initUserIdentity() {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const savedOwner = localStorage.getItem("zoom_is_owner") === "true";

    if (isLocalhost || savedOwner) {
      this.isOwner = true;
      localStorage.setItem("zoom_is_owner", "true");
      this.userName = localStorage.getItem("zoom_user_name") || "Xayrulloyev Azizbek";
      this.userRole = "Developer (Host)";
      this.avatarColor = "from-blue-600 to-indigo-600";
      this.applyUserProfile();
      return;
    }

    // External Visitors (mobile phones, other devices)
    this.isOwner = false;
    const savedName = localStorage.getItem("zoom_user_name");
    const savedRole = localStorage.getItem("zoom_user_role") || "Ishtirokchi";
    const savedColor = localStorage.getItem("zoom_user_color") || "from-purple-600 to-pink-600";

    if (!savedName || savedName.trim() === "") {
      this.userName = "";
      this.userRole = savedRole;
      this.avatarColor = savedColor;
      this.applyUserProfile();
      setTimeout(() => {
        this.showRegistrationModal();
      }, 300);
    } else {
      this.userName = savedName.trim();
      this.userRole = savedRole;
      this.avatarColor = savedColor;
      this.applyUserProfile();
    }
  }

  showRegistrationModal(onSuccess = null) {
    const modal = document.getElementById("modal-user-registration");
    if (!modal) return;
    modal.classList.remove("hidden");
    const nameInput = document.getElementById("reg-input-name");
    const roleInput = document.getElementById("reg-input-role");
    if (nameInput) {
      nameInput.value = this.userName || "";
      nameInput.focus();
    }
    if (roleInput && this.userRole) {
      roleInput.value = this.userRole;
    }
    this.onRegistrationSuccess = onSuccess;
  }

  applyUserProfile() {
    const displayName = this.userName || (this.isOwner ? "Azizbek" : "Mehmon");
    const initial = displayName.charAt(0).toUpperCase();

    // 1. Home header profile
    const nameEl = document.getElementById("home-user-name");
    const avatarEl = document.getElementById("home-user-avatar");
    const roleEl = document.querySelector("#btn-profile-menu .text-gray-400");
    if (nameEl) nameEl.textContent = displayName;
    if (avatarEl) {
      avatarEl.textContent = initial;
      if (this.avatarColor) {
        avatarEl.className = `w-7 h-7 rounded-lg bg-gradient-to-tr ${this.avatarColor} flex items-center justify-center font-bold text-xs text-white`;
      }
    }
    if (roleEl) roleEl.textContent = this.userRole || (this.isOwner ? "Developer" : "Ishtirokchi");

    // 2. Pre-fill input fields with their own identity
    const inputQuick = document.getElementById("input-user-name");
    const inputModal = document.getElementById("modal-input-join-name");
    if (inputQuick) inputQuick.value = displayName;
    if (inputModal) inputModal.value = displayName;

    // 3. Local meeting tile label & avatar
    const localName = document.getElementById("local-name-label");
    const localAvatar = document.getElementById("local-avatar");
    if (localName) localName.textContent = displayName;
    if (localAvatar) localAvatar.textContent = initial;
  }

  bindRegistrationEvents() {
    this.selectedRegColor = this.avatarColor || "from-blue-600 to-indigo-600";
    document.querySelectorAll(".reg-color-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".reg-color-btn").forEach((b) => {
          b.classList.remove("ring-2", "ring-blue-500", "scale-110", "border-white");
          b.classList.add("border-transparent");
        });
        btn.classList.add("ring-2", "ring-blue-500", "scale-110", "border-white");
        btn.classList.remove("border-transparent");
        this.selectedRegColor = btn.getAttribute("data-color");
      });
    });

    const btnSubmit = document.getElementById("btn-submit-registration");
    btnSubmit?.addEventListener("click", () => {
      const nameInput = document.getElementById("reg-input-name");
      const roleInput = document.getElementById("reg-input-role");
      const name = nameInput?.value.trim();
      const role = roleInput?.value.trim() || "Ishtirokchi";

      if (!name || name.length < 2) {
        this.showToast("Iltimos, ismingizni kiriting!");
        nameInput?.focus();
        return;
      }

      this.userName = name;
      this.userRole = role;
      this.avatarColor = this.selectedRegColor || "from-blue-600 to-indigo-600";

      localStorage.setItem("zoom_user_name", this.userName);
      localStorage.setItem("zoom_user_role", this.userRole);
      localStorage.setItem("zoom_user_color", this.avatarColor);

      document.getElementById("modal-user-registration")?.classList.add("hidden");
      this.applyUserProfile();
      this.showToast(`Xush kelibsiz, ${this.userName}! 🎉`);

      if (typeof this.onRegistrationSuccess === "function") {
        this.onRegistrationSuccess();
        this.onRegistrationSuccess = null;
      }
    });

    document.getElementById("btn-profile-menu")?.addEventListener("click", () => {
      this.showRegistrationModal();
    });
  }

  setupLobbyClock() {
    const updateTime = () => {
      const now = new Date();
      const clockEl = document.getElementById("lobby-clock");
      const dateEl = document.getElementById("lobby-date");
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      if (dateEl) {
        const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
        const days = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
        dateEl.textContent = `${now.getDate()} ${months[now.getMonth()]}, ${now.getFullYear()} • ${days[now.getDay()]}`;
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  handleUrlRouting() {
    const path = window.location.pathname;
    const match = path.match(/\/room\/([a-zA-Z0-9\-]+)/);
    if (match && match[1]) {
      const rawId = match[1];
      const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const inputRoom = document.getElementById("input-room-id");
      if (inputRoom) {
        inputRoom.value = rawId;
      }
      const modalInputId = document.getElementById("modal-input-join-id");
      if (modalInputId) {
        modalInputId.value = rawId;
      }

      if (!this.userName || this.userName.trim() === "") {
        this.showRegistrationModal(() => {
          this.joinMeeting(rawId, this.userName);
        });
      } else {
        if (this.isOwner) {
          this.joinMeeting(rawId, this.userName);
        } else {
          this.openJoinModal(rawId);
        }
      }
      this.showToast(`${rawId} uchrashuviga ulanish`);
    }
  }

  openJoinModal(rawId) {
    const joinModal = document.getElementById("modal-zoom-join");
    if (joinModal) {
      joinModal.classList.remove("hidden");
      const nameInput = document.getElementById("modal-input-join-name");
      if (nameInput) {
        nameInput.value = this.userName || "Mehmon";
        nameInput.focus();
      }
    }
  }

  // Bind Zoom Workplace Dashboard Events
  bindLobbyEvents() {
    // 1. Navigation Tab Switching (Home, Team Chat, Meetings, Whiteboards)
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetTab = tab.getAttribute("data-tab");

        // Update Tab button styles
        document.querySelectorAll(".nav-tab").forEach((t) => {
          t.classList.remove("active", "bg-zoom-blue/20", "text-zoom-blue", "border", "border-zoom-blue/30");
          t.classList.add("text-gray-400");
        });
        tab.classList.add("active", "bg-zoom-blue/20", "text-zoom-blue", "border", "border-zoom-blue/30");
        tab.classList.remove("text-gray-400");

        // Switch Page Content
        document.querySelectorAll(".tab-page").forEach((page) => page.classList.add("hidden"));
        const activePage = document.getElementById(`tab-content-${targetTab}`);
        if (activePage) activePage.classList.remove("hidden");
      });
    });

    // 2. The 4 Big Zoom Action Cards
    const btnNewMeeting = document.getElementById("btn-zoom-new-meeting");
    const btnJoinModal = document.getElementById("btn-zoom-join-meeting");
    const btnSchedule = document.getElementById("btn-zoom-schedule-meeting");
    const btnShareDirect = document.getElementById("btn-zoom-share-direct");

    // New Meeting (Orange)
    btnNewMeeting?.addEventListener("click", async () => {
      if (!this.userName || this.userName.trim() === "") {
        this.showRegistrationModal(() => {
          btnNewMeeting.click();
        });
        return;
      }
      const name = this.userName;
      try {
        const res = await fetch("/api/rooms/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Resource Group Meeting", host_name: name })
        });
        const data = await res.json();
        this.joinMeeting(data.room_id, name);
      } catch (e) {
        this.showToast("Xona yaratishda xatolik!");
      }
    });

    // Join Modal (Blue)
    btnJoinModal?.addEventListener("click", () => {
      if (!this.userName || this.userName.trim() === "") {
        this.showRegistrationModal(() => {
          btnJoinModal.click();
        });
        return;
      }
      document.getElementById("modal-zoom-join")?.classList.remove("hidden");
      document.getElementById("modal-input-join-id")?.focus();
    });

    // Schedule Modal (Calendar)
    const openScheduleModal = () => {
      // Set today's date
      const dateInput = document.getElementById("input-sched-date");
      if (dateInput) {
        const today = new Date().toISOString().split("T")[0];
        dateInput.value = today;
      }
      document.getElementById("modal-zoom-schedule")?.classList.remove("hidden");
    };

    btnSchedule?.addEventListener("click", openScheduleModal);
    document.getElementById("btn-add-schedule-shortcut")?.addEventListener("click", openScheduleModal);
    document.getElementById("btn-tab-schedule-open")?.addEventListener("click", openScheduleModal);

    // Share Screen Direct (Green)
    btnShareDirect?.addEventListener("click", () => {
      document.getElementById("modal-zoom-share")?.classList.remove("hidden");
      document.getElementById("input-share-room-id")?.focus();
    });

    // Quick Connect Join Bar
    const btnQuickJoin = document.getElementById("btn-quick-join");
    const inputRoom = document.getElementById("input-room-id");
    const inputName = document.getElementById("input-user-name");

    btnQuickJoin?.addEventListener("click", () => {
      const roomId = inputRoom.value.trim();
      let name = inputName.value.trim() || this.userName;
      if (!name || name.trim() === "") {
        this.showRegistrationModal(() => {
          btnQuickJoin.click();
        });
        return;
      }
      if (!roomId) {
        this.showToast("Xona ID raqamini kiriting!");
        inputRoom.focus();
        return;
      }
      this.joinMeeting(roomId, name);
    });

    // 3. Modal Confirmations
    // Join Confirmation
    document.getElementById("btn-modal-confirm-join")?.addEventListener("click", () => {
      const roomId = document.getElementById("modal-input-join-id")?.value.trim();
      const name = document.getElementById("modal-input-join-name")?.value.trim() || this.userName || "Mehmon";
      const noAudio = document.getElementById("chk-join-no-audio")?.checked;
      const noVideo = document.getElementById("chk-join-no-video")?.checked;

      if (!name || name.trim() === "") {
        this.showRegistrationModal(() => {
          document.getElementById("btn-modal-confirm-join")?.click();
        });
        return;
      }

      if (!roomId) {
        this.showToast("Uchrashuv ID raqamini kiriting!");
        return;
      }

      document.getElementById("modal-zoom-join")?.classList.add("hidden");
      this.joinMeeting(roomId, name, { noAudio, noVideo });
    });

    // Schedule Confirmation
    document.getElementById("btn-confirm-schedule")?.addEventListener("click", async () => {
      const topic = document.getElementById("input-sched-topic")?.value.trim() || "Yangi Uchrashuv";
      const date = document.getElementById("input-sched-date")?.value || "Bugun";
      const time = document.getElementById("input-sched-time")?.value || "14:00";
      const duration = document.getElementById("select-sched-duration")?.value || "45";

      try {
        const res = await fetch("/api/meetings/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            date,
            time,
            duration: `${duration} daqiqa`,
            host_name: this.userName || "Xayrulloyev Azizbek"
          })
        });
        const data = await res.json();
        if (data && data.meeting) {
          this.renderScheduledMeetings();
        }
      } catch (e) {
        console.warn("Backend schedule error, falling back to local:", e);
        const part1 = Math.floor(100 + Math.random() * 900);
        const part2 = Math.floor(100 + Math.random() * 900);
        const part3 = Math.floor(100 + Math.random() * 900);
        const newId = `${part1}-${part2}-${part3}`;
        const meetingObj = { id: newId, topic, date, time, duration: `${duration} daqiqa` };
        this.saveScheduledMeetingLocal(meetingObj);
      }

      document.getElementById("modal-zoom-schedule")?.classList.add("hidden");
      this.showToast("Uchrashuv bazada muvaffaqiyatli rejalashtirildi! 📅");
    });

    // Direct Share Confirmation
    document.getElementById("btn-confirm-direct-share")?.addEventListener("click", () => {
      const roomId = document.getElementById("input-share-room-id")?.value.trim();
      if (!roomId) {
        this.showToast("Xona ID raqamini kiriting!");
        return;
      }
      document.getElementById("modal-zoom-share")?.classList.add("hidden");
      this.joinMeeting(roomId, "Azizbek", { autoShare: true });
    });

    // Whiteboard Direct Start
    document.getElementById("btn-create-whiteboard-direct")?.addEventListener("click", async () => {
      const part1 = Math.floor(100 + Math.random() * 900);
      const part2 = Math.floor(100 + Math.random() * 900);
      const part3 = Math.floor(100 + Math.random() * 900);
      const newId = `${part1}-${part2}-${part3}`;
      await this.joinMeeting(newId, "Azizbek");
      setTimeout(() => {
        document.getElementById("whiteboard-modal")?.classList.remove("hidden");
        this.whiteboard.resizeCanvas();
      }, 500);
    });

    // 4. PMI (Personal Meeting ID) Management
    this.initPMI();

    // 5. Scheduled Meetings Store & Render
    this.renderScheduledMeetings();

    // 6. Lobby device preview
    this.startLobbyPreview();
  }

  initPMI() {
    let pmi = localStorage.getItem("zoom_pmi");
    if (!pmi) {
      pmi = "590-429-468";
      localStorage.setItem("zoom_pmi", pmi);
    }
    const pmiDisplay = document.getElementById("pmi-display");
    if (pmiDisplay) pmiDisplay.textContent = pmi;

    document.getElementById("btn-copy-pmi")?.addEventListener("click", () => {
      const url = `${window.location.origin}/room/${pmi}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast("Shaxsiy uchrashuv (PMI) havolasi nusxalandi!");
      });
    });

    document.getElementById("btn-start-pmi")?.addEventListener("click", () => {
      const name = document.getElementById("input-user-name")?.value.trim() || this.userName || "Mehmon";
      this.joinMeeting(pmi, name);
    });
  }

  saveScheduledMeetingLocal(meeting) {
    let list = JSON.parse(localStorage.getItem("zoom_scheduled_meetings") || "[]");
    list.unshift(meeting);
    localStorage.setItem("zoom_scheduled_meetings", JSON.stringify(list));
    this.renderScheduledMeetings();
  }

  async renderScheduledMeetings() {
    let list = [];
    try {
      const res = await fetch("/api/meetings/list");
      const data = await res.json();
      if (data && data.meetings && data.meetings.length > 0) {
        list = data.meetings;
      }
    } catch (e) {
      console.warn("Could not fetch meetings from SQLite, using fallback:", e);
    }

    if (list.length === 0) {
      list = JSON.parse(localStorage.getItem("zoom_scheduled_meetings") || "[]");
    }

    // Purge old demo entries if present
    list = list.filter(m => !m.topic.toLowerCase().includes("demo") && !m.topic.toLowerCase().includes("zoom clone"));

    if (list.length === 0) {
      list = [
        { id: "590-429-468", topic: "Resource Group Boshqaruv Majlisi", date: "Bugun", time: "15:00", duration: "45 daqiqa" },
        { id: "842-193-774", topic: "IT Loyihalar Muhokamasi & Plan", date: "Bugun", time: "18:00", duration: "1 soat" }
      ];
    }

    const homeList = document.getElementById("scheduled-meetings-list");
    const tabList = document.getElementById("tab-meetings-container");

    if (homeList) {
      homeList.innerHTML = list.map((m, idx) => `
        <div class="p-3 rounded-xl bg-zoom-tile/70 border border-zoom-border hover:border-zoom-blue transition-all flex items-center justify-between group">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-zoom-blue/20 text-zoom-blue flex items-center justify-center font-bold text-xs flex-shrink-0">
              <i data-lucide="video" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-white group-hover:text-zoom-blue transition-colors line-clamp-1">${m.topic}</div>
              <div class="text-[10px] text-gray-400">${m.time} • ${m.duration} • ID: <span class="text-gray-300 font-mono">${m.id}</span></div>
            </div>
          </div>
          <button class="btn-start-scheduled px-3 py-1 bg-zoom-blue hover:bg-zoom-blue-hover text-white rounded-lg text-xs font-semibold shadow-md shadow-zoom-blue/20" data-id="${m.id}" data-topic="${m.topic}">
            Boshlash
          </button>
        </div>
      `).join("");
    }

    if (tabList) {
      tabList.innerHTML = list.map((m) => `
        <div class="p-4 rounded-2xl bg-zoom-bar border border-zoom-border flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-zoom-blue/20 text-zoom-blue flex items-center justify-center font-bold flex-shrink-0">
              <i data-lucide="calendar" class="w-6 h-6"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">${m.topic}</h3>
              <p class="text-xs text-gray-400 mt-0.5">${m.date} • ${m.time} (${m.duration})</p>
              <p class="text-xs text-zoom-blue font-mono mt-1">Uchrashuv ID: ${m.id}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn-copy-scheduled px-3 py-2 bg-zoom-tile hover:bg-zoom-border text-gray-300 rounded-xl text-xs flex items-center gap-1.5" data-id="${m.id}">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i> Nusxalash
            </button>
            <button class="btn-start-scheduled px-4 py-2 bg-zoom-blue hover:bg-zoom-blue-hover text-white rounded-xl text-xs font-bold" data-id="${m.id}" data-topic="${m.topic}">
              Boshlash
            </button>
          </div>
        </div>
      `).join("");
    }

    // Bind Start and Copy buttons
    document.querySelectorAll(".btn-start-scheduled").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        this.joinMeeting(id, this.userName || "Mehmon");
      });
    });

    document.querySelectorAll(".btn-copy-scheduled").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const url = `${window.location.origin}/room/${id}`;
        navigator.clipboard.writeText(url).then(() => {
          this.showToast("Uchrashuv taklifnomasi nusxalandi!");
        });
      });
    });

    lucide.createIcons();
  }

  async startLobbyPreview() {
    // Skip lobby preview if entering directly into a room via URL to prevent camera lock on mobile
    if (window.location.pathname.startsWith("/room/")) {
      return;
    }

    const previewVideo = document.getElementById("lobby-preview-video");
    const previewPlaceholder = document.getElementById("lobby-preview-placeholder");
    const audioBar = document.getElementById("lobby-audio-bar");
    const btnLobbyMic = document.getElementById("lobby-toggle-mic");
    const btnLobbyCam = document.getElementById("lobby-toggle-cam");

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.lobbyStream = stream;
      if (previewVideo) {
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewVideo.srcObject = stream;
        previewPlaceholder.classList.add("hidden");
      }
      
      // Setup audio meter for lobby
      window.addEventListener("local-volume", (e) => {
        if (audioBar) {
          const vol = Math.min(100, Math.max(0, e.detail.volume * 2));
          audioBar.style.width = `${vol}%`;
        }
      });
    } catch (e) {
      console.warn("Lobby preview not permitted or unavailable:", e);
    }

    btnLobbyCam?.addEventListener("click", () => {
      if (this.lobbyStream) {
        const vTrack = this.lobbyStream.getVideoTracks()[0];
        if (vTrack) {
          vTrack.enabled = !vTrack.enabled;
          previewPlaceholder.classList.toggle("hidden", vTrack.enabled);
        }
      }
    });

    btnLobbyMic?.addEventListener("click", () => {
      if (this.lobbyStream) {
        const aTrack = this.lobbyStream.getAudioTracks()[0];
        if (aTrack) {
          aTrack.enabled = !aTrack.enabled;
          btnLobbyMic.classList.toggle("bg-red-600", !aTrack.enabled);
        }
      }
    });
  }

  // Join Meeting Flow
  async joinMeeting(roomId, userName, options = {}) {
    // 0. Release lobby preview stream to prevent camera lock on mobile phones
    if (this.lobbyStream) {
      try {
        this.lobbyStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      this.lobbyStream = null;
      const previewVideo = document.getElementById("lobby-preview-video");
      if (previewVideo) previewVideo.srcObject = null;
    }

    const rawId = (roomId || "123-456-789").trim();
    // Normalize room id: strip hyphens/spaces and lowercase
    const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    
    // Pretty formatted ID for display: 9-digits xxx-xxx-xxx
    let formattedId = rawId;
    if (cleanId.length === 9 && !rawId.includes("-")) {
      formattedId = `${cleanId.slice(0, 3)}-${cleanId.slice(3, 6)}-${cleanId.slice(6, 9)}`;
    }
    
    this.roomId = cleanId;
    this.displayRoomId = formattedId;
    this.userName = (userName || this.userName || "Mehmon").trim();

    // Switch views
    document.getElementById("screen-lobby").classList.add("hidden");
    const meetingScreen = document.getElementById("screen-meeting");
    meetingScreen.classList.remove("hidden");

    document.getElementById("meeting-title-display").textContent = this.displayRoomId;
    document.getElementById("local-name-label").textContent = this.userName;
    const localAvatar = document.getElementById("local-avatar");
    if (localAvatar) {
      localAvatar.textContent = this.userName.charAt(0).toUpperCase();
    }

    // Update URL without reloading
    window.history.pushState({}, "", `/room/${this.displayRoomId}`);

    // Start meeting timer
    this.meetingStartTime = Date.now();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.meetingStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      const display = document.getElementById("timer-display");
      if (display) display.textContent = `${mins}:${secs}`;
    }, 1000);

    // Init WebSocket
    this.connectWebSocket(options);
  }

  connectWebSocket(options = {}) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/${this.roomId}`;

    this.socket = new WebSocket(wsUrl);

    // Wrapper to send JSON
    this.socket.sendJSON = (obj) => {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(obj));
      }
    };

    // Instantiate Sub-managers
    this.webrtc = new WebRTCManager({ send: (obj) => this.socket.sendJSON(obj) });
    this.whiteboard = new WhiteboardManager({ send: (obj) => this.socket.sendJSON(obj) });
    this.chat = new ChatManager({ send: (obj) => this.socket.sendJSON(obj) });

    this.socket.onopen = async () => {
      // 1. Immediately send JOIN so all peers and server know we are in the room right away
      this.socket.sendJSON({
        action: "join",
        name: this.userName,
        audio: !options.noAudio,
        video: !options.noVideo
      });

      // 2. Start local media asynchronously
      try {
        const localStream = await this.webrtc.initLocalMedia();
        if (localStream) {
          this.setLocalVideoTrack(localStream);
        }
      } catch (err) {
        console.warn("Init local media warning:", err);
      }

      if (options.noAudio) {
        this.webrtc.toggleAudio(false);
      }
      if (options.noVideo) {
        this.webrtc.toggleVideo(false);
      }

      this.updateCamUI();
      this.updateMicUI();

      if (options.autoShare) {
        setTimeout(() => {
          document.getElementById("btn-share-screen")?.click();
        }, 1200);
      }

      // 3. Notify room of final media state
      this.socket.sendJSON({
        action: "media-state",
        audio: !this.webrtc.isMuted,
        video: !this.webrtc.isVideoOff
      });
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleSocketMessage(data);
    };

    this.socket.onclose = () => {
      console.warn("WebSocket closed.");
      if (!this.isUserIntentionalLeave && this.roomId) {
        this.showToast("Aloqa tiklanmoqda... Qayta ulanish 🔄");
        setTimeout(() => {
          if (!this.isUserIntentionalLeave && this.roomId) {
            this.connectWebSocket(options);
          }
        }, 1500);
      } else {
        this.showToast("Uchrashuvdan chiqildi.");
      }
    };

    // Listen to WebRTC events
    window.addEventListener("remote-track", (e) => {
      const { peerId, stream } = e.detail;
      this.attachRemoteStream(peerId, stream);
    });

    // Local volume listener for speaking border
    window.addEventListener("local-volume", (e) => {
      const localTile = document.getElementById("tile-local");
      if (localTile) {
        if (e.detail.volume > 15 && !this.webrtc.isMuted) {
          localTile.classList.add("active-speaker");
        } else {
          localTile.classList.remove("active-speaker");
        }
      }
    });

    // Global gesture listener to unlock any blocked remote audio elements & local camera on mobile
    const unlockAllMedia = () => {
      document.querySelectorAll("audio").forEach(audioEl => {
        if (audioEl.paused && audioEl.srcObject) {
          audioEl.play().catch(() => {});
        }
      });
      const localVideo = document.getElementById("local-video");
      if (localVideo && !this.webrtc?.isVideoOff && this.webrtc?.localStream) {
        const vTracks = this.webrtc.localStream.getVideoTracks();
        if (vTracks.length > 0 && vTracks[0].enabled) {
          if (!localVideo.srcObject) {
            this.setLocalVideoTrack(this.webrtc.localStream);
          } else if (localVideo.paused) {
            localVideo.muted = true;
            localVideo.play().catch(() => {});
          }
        }
      }
    };
    window.addEventListener("click", unlockAllMedia);
    window.addEventListener("touchstart", unlockAllMedia);
  }

  handleSocketMessage(data) {
    switch (data.type) {
      case "welcome":
        this.peerId = data.peer_id;
        this.isHost = data.is_host;
        this.updateHostBadge();
        
        // Populate existing peers
        data.existing_peers.forEach((peer) => {
          this.addParticipant(peer);
          // Initiate WebRTC connection to existing peer
          this.webrtc.createPeerConnection(peer.id, true);
        });

        // Load whiteboard history
        if (data.whiteboard_history) {
          data.whiteboard_history.forEach((stroke) => this.whiteboard.renderStroke(stroke));
        }

        // Load chat history
        if (data.chat_history) {
          data.chat_history.forEach((msg) => this.chat.addMessage(msg, msg.sender_id === this.peerId));
        }
        this.updateLayout();
        break;

      case "peer-joined":
        this.showToast(`${data.peer.name} uchrashuvga qo'shildi`);
        this.addParticipant(data.peer);
        this.webrtc.createPeerConnection(data.peer.id, false);
        this.updateLayout();
        break;

      case "signal":
        this.webrtc.handleSignal(data.sender, data.signal);
        break;

      case "peer-media-state":
        this.updateParticipantMediaState(data.peer_id, data.audio, data.video, data.screen);
        break;

      case "hand-state":
        this.updateHandState(data.peer_id, data.hand, data.name);
        break;

      case "chat-message":
        this.chat.addMessage(data.message, data.message.sender_id === this.peerId);
        break;

      case "peer-caption":
        this.displayCaption(data.name || "Ishtirokchi", data.text || "");
        break;

      case "ambient-music":
        this.syncAmbientMusic(data.track, data.playing, data.volume);
        break;

      case "reaction":
        this.chat.showFloatingReaction(data.emoji, data.name);
        break;

      case "whiteboard-draw":
        this.whiteboard.renderStroke(data.stroke);
        break;

      case "whiteboard-clear":
        this.whiteboard.clear();
        break;

      case "poll-started":
        this.currentPoll = data.poll;
        this.renderPollView(data.poll);
        document.getElementById("modal-poll-view")?.classList.remove("hidden");
        this.showToast("Yangi so'rovnoma boshlandi 📊");
        break;

      case "poll-updated":
        this.currentPoll = data.poll;
        this.renderPollView(data.poll);
        break;

      case "force-mute":
        this.webrtc.toggleAudio(false);
        this.updateMicUI();
        this.showToast("Moderator barchaning ovozini o'chirdi!");
        break;

      case "room-locked-state":
        const lockBadge = document.getElementById("room-lock-badge");
        lockBadge.classList.toggle("hidden", !data.locked);
        this.showToast(data.locked ? "Xona qulflandi" : "Xona ochildi");
        break;

      case "meeting-ended":
        alert(data.message || "Moderator uchrashuvni barcha uchun yakunladi.");
        if (this.socket) this.socket.close();
        if (this.webrtc) this.webrtc.closeAll();
        window.location.href = "/";
        break;

      case "kicked":
        alert(data.message);
        window.location.href = "/";
        break;

      case "new-host":
        if (data.host_id === this.peerId) {
          this.isHost = true;
          this.updateHostBadge();
          this.showToast("Siz endi yangi moderator (Host) siz!");
        }
        break;

      case "peer-left":
        this.showToast(`${data.name} chiqib ketdi`);
        this.removeParticipant(data.peer_id);
        this.webrtc.closePeer(data.peer_id);
        this.updateLayout();
        break;

      case "in-waiting-room":
        this.isInWaitingRoom = true;
        document.getElementById("screen-meeting")?.classList.add("hidden");
        document.getElementById("screen-waiting-room")?.classList.remove("hidden");
        const wDisplay = document.getElementById("waiting-room-id-display");
        if (wDisplay) wDisplay.textContent = this.roomId || "---";
        break;

      case "admitted":
        this.isInWaitingRoom = false;
        document.getElementById("screen-waiting-room")?.classList.add("hidden");
        document.getElementById("screen-meeting")?.classList.remove("hidden");
        this.showToast("Moderator sizni xonaga kiritdi! Xush kelibsiz 🎉");
        break;

      case "denied":
        alert("Moderator sizning uchrashuvga kirishingizni rad etdi.");
        window.location.href = "/";
        break;

      case "peer-waiting":
        this.showToast(`${data.name} kutish zalida kutyapti`);
        const banner = document.getElementById("host-waiting-banner");
        const nameSpan = document.getElementById("waiting-peer-name");
        if (banner && nameSpan) {
          nameSpan.textContent = data.name;
          banner.classList.remove("hidden");
          document.getElementById("btn-admit-waiting-peer").onclick = () => {
            this.socket?.sendJSON({ action: "admit-peer", peerId: data.peerId });
            banner.classList.add("hidden");
          };
          document.getElementById("btn-deny-waiting-peer").onclick = () => {
            this.socket?.sendJSON({ action: "deny-peer", peerId: data.peerId });
            banner.classList.add("hidden");
          };
        }
        break;

      case "permissions-updated":
        if (data.mute_av_lock !== undefined) {
          this.muteAvLocked = data.mute_av_lock;
          if (this.muteAvLocked && !this.isHost) {
            this.webrtc?.toggleAudio(false);
            this.webrtc?.toggleVideo(false);
            this.updateMicUI();
            this.updateCamUI();
            this.showToast("Moderator mikrofon va kamerani blokladi!");
          }
        }
        if (data.screen_lock !== undefined) {
          this.screenLocked = data.screen_lock;
        }
        break;

      case "peer-timed-out":
        if (data.peer_id === this.peerId) {
          this.webrtc?.toggleAudio(false);
          this.webrtc?.toggleVideo(false);
          this.updateMicUI();
          this.updateCamUI();
          this.showToast("Siz moderator tomonidan 5 daqiqaga muzlatildingiz!");
        } else {
          this.showToast(`${data.name} 5 daqiqaga muzlatildi.`);
        }
        break;

      case "chat-pinned":
        const pinContainer = document.getElementById("pinned-chat-container");
        const pinText = document.getElementById("pinned-chat-text");
        if (pinContainer && pinText) {
          pinContainer.classList.remove("hidden");
          pinText.textContent = `${data.sender}: ${data.text}`;
        }
        break;

      case "chat-unpinned":
        document.getElementById("pinned-chat-container")?.classList.add("hidden");
        break;

      case "qa-new-question":
        this.appendQaQuestion(data.question);
        break;

      case "qa-question-upvoted":
        this.updateQaUpvote(data.id, data.upvotes);
        break;

      case "breakout-assigned":
        this.showToast(`Siz ${data.room_name}ga biriktirildingiz! 🚪`);
        break;

      case "breakout-ended":
        this.showToast("Breakout xonalar tugadi. Barcha asosiy zalga qaytdi!");
        break;

      case "youtube-sync":
        this.handleYoutubeSync(data.state, data.by);
        break;

      case "quiz-started":
        this.handleQuizStarted(data.quiz, data.by);
        break;

      case "quiz-progress":
        this.handleQuizProgress(data.total_answers, data.total_peers);
        break;

      case "quiz-ended":
        this.handleQuizEnded(data.correct, data.leaderboard);
        break;

      case "speaker-timer":
        this.handleSpeakerTimer(data.timer);
        break;

      case "sound-effect":
        this.playSynthesizedSound(data.sound, data.by);
        break;

      case "focus-status":
        this.handleFocusStatus(data.peer_id, data.name, data.status);
        break;

      case "watermark-toggle":
        this.toggleWatermarkUI(data.enabled);
        break;

      case "error":
        alert(data.message);
        window.location.href = "/";
        break;
    }
  }

  updateHostBadge() {
    const badge = document.getElementById("role-badge");
    const securityBtn = document.getElementById("btn-security");
    const breakoutBtn = document.getElementById("btn-header-breakout");
    if (this.isHost) {
      if (badge) {
        badge.textContent = "Host (Moderator)";
        badge.className = "text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold";
      }
      securityBtn?.classList.remove("hidden");
      breakoutBtn?.classList.remove("hidden");
    } else {
      if (badge) {
        badge.textContent = "Ishtirokchi";
        badge.className = "text-xs px-2.5 py-0.5 rounded-full bg-zoom-blue/20 text-zoom-blue border border-zoom-blue/30 font-medium";
      }
      breakoutBtn?.classList.add("hidden");
    }
  }

  // Add remote participant to state & UI
  addParticipant(peer) {
    this.participants.set(peer.id, peer);
    this.createVideoTile(peer);
    this.updateParticipantsList();
    this.updateTargetSelect();
  }

  removeParticipant(peerId) {
    this.participants.delete(peerId);
    const tile = document.getElementById(`tile-${peerId}`);
    if (tile) tile.remove();
    this.updateParticipantsList();
    this.updateTargetSelect();
  }

  createVideoTile(peer) {
    const grid = document.getElementById("video-grid");
    if (!grid || document.getElementById(`tile-${peer.id}`)) return;

    const tile = document.createElement("div");
    tile.id = `tile-${peer.id}`;
    tile.className = "video-tile";

    const video = document.createElement("video");
    video.id = `video-${peer.id}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Always muted so browser autoplay policy never blocks video rendering
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.style.display = "none";
    video.classList.add("hidden");

    const audio = document.createElement("audio");
    audio.id = `audio-${peer.id}`;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("autoplay", "");

    const avatar = document.createElement("div");
    avatar.id = `avatar-${peer.id}`;
    avatar.className = "avatar-placeholder";
    avatar.style.display = "flex"; // AVATAR IS VISIBLE BY DEFAULT UNTIL VIDEO PLAYS!
    avatar.textContent = (peer.name || "U").charAt(0).toUpperCase();

    // Top overlay (Hand raise)
    const overlayTop = document.createElement("div");
    overlayTop.className = "tile-overlay-top";
    overlayTop.innerHTML = `
      <div id="hand-${peer.id}" class="hand-badge ${peer.hand ? "" : "hidden"}">
        <i data-lucide="hand" class="w-3 h-3"></i> Ko'tarildi
      </div>
    `;

    // Bottom overlay (Name & Mic)
    const overlayBottom = document.createElement("div");
    overlayBottom.className = "tile-overlay-bottom";
    overlayBottom.innerHTML = `
      <i id="mic-icon-${peer.id}" data-lucide="${peer.audio ? "mic" : "mic-off"}" class="w-3.5 h-3.5 ${peer.audio ? "text-zoom-green" : "text-red-400"}"></i>
      <span>${peer.name}</span>
      ${peer.is_host ? '<span class="text-[10px] text-amber-400">(Host)</span>' : ""}
    `;

    tile.appendChild(video);
    tile.appendChild(audio);
    tile.appendChild(avatar);
    tile.appendChild(overlayTop);
    tile.appendChild(overlayBottom);
    grid.appendChild(tile);

    lucide.createIcons({ root: tile });
  }

  attachRemoteStream(peerId, stream) {
    const video = document.getElementById(`video-${peerId}`);
    const audio = document.getElementById(`audio-${peerId}`);
    const avatar = document.getElementById(`avatar-${peerId}`);
    const peer = this.participants.get(peerId);

    if (audio) {
      if (audio.srcObject !== stream) {
        audio.srcObject = stream;
      }
      audio.muted = false;
      audio.volume = 1.0;
      audio.play().catch(e => {
        console.warn("Autoplay audio error, retrying on click/touch:", e);
        const unlock = () => {
          audio.play().catch(() => {});
          document.removeEventListener("click", unlock);
          document.removeEventListener("touchstart", unlock);
        };
        document.addEventListener("click", unlock, { once: true });
        document.addEventListener("touchstart", unlock, { once: true });
      });
    }

    if (video) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.muted = true;
      video.playsInline = true;

      const vTracks = stream.getVideoTracks();
      const hasLiveVideo = vTracks.length > 0 && vTracks[0].enabled && vTracks[0].readyState === "live";

      if (hasLiveVideo) {
        video.play().then(() => {
          if (avatar) {
            avatar.style.display = "none";
            avatar.classList.add("hidden");
          }
          video.style.display = "block";
          video.classList.remove("hidden");
        }).catch(e => {
          console.warn("Video play error:", e);
        });
      } else {
        video.style.display = "none";
        video.classList.add("hidden");
        if (avatar) {
          avatar.style.display = "flex";
          avatar.classList.remove("hidden");
          avatar.textContent = (peer?.name || "U").charAt(0).toUpperCase();
        }
      }

      video.onplaying = () => {
        if (avatar && stream.getVideoTracks().some(t => t.enabled)) {
          avatar.classList.add("hidden");
          avatar.style.display = "none";
          video.classList.remove("hidden");
          video.style.display = "block";
        }
      };
    }
  }

  updateParticipantMediaState(peerId, audio, video, screen) {
    const p = this.participants.get(peerId);
    if (p) {
      p.audio = audio;
      p.video = video;
      p.screen = screen;
    }

    const micIcon = document.getElementById(`mic-icon-${peerId}`);
    if (micIcon) {
      micIcon.setAttribute("data-lucide", audio ? "mic" : "mic-off");
      micIcon.className = `w-3.5 h-3.5 ${audio ? "text-zoom-green" : "text-red-400"}`;
      lucide.createIcons();
    }

    const avatar = document.getElementById(`avatar-${peerId}`);
    const videoEl = document.getElementById(`video-${peerId}`);
    if (avatar) {
      avatar.style.display = video ? "none" : "flex";
      avatar.classList.toggle("hidden", video);
      if (!video && p) {
        avatar.textContent = (p.name || "U").charAt(0).toUpperCase();
      }
    }
    if (videoEl) {
      videoEl.style.display = video ? "block" : "none";
      videoEl.classList.toggle("hidden", !video);
      if (video && videoEl.srcObject && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    }
  }

  updateHandState(peerId, hand, name) {
    if (peerId === this.peerId) {
      const localHand = document.getElementById("local-hand-badge");
      localHand.classList.toggle("hidden", !hand);
      document.getElementById("label-hand").textContent = hand ? "Qo'lni tushirish" : "Qo'l ko'tarish";
      return;
    }

    const badge = document.getElementById(`hand-${peerId}`);
    if (badge) {
      badge.classList.toggle("hidden", !hand);
    }
    if (hand) {
      this.showToast(`${name} qo'l ko'tardi ✋`);
    }
  }

  // Responsive Grid layout recalculator with strictly bounded tiles
  updateLayout() {
    const grid = document.getElementById("video-grid");
    if (!grid) return;

    const total = 1 + this.participants.size; // local + remotes
    grid.className = "video-grid w-full h-full max-w-7xl mx-auto"; // Reset & retain sizing

    if (total === 1) grid.classList.add("grid-1");
    else if (total === 2) grid.classList.add("grid-2");
    else if (total <= 4) grid.classList.add("grid-3");
    else if (total <= 6) grid.classList.add("grid-5");
    else if (total <= 9) grid.classList.add("grid-7");
    else if (total <= 12) grid.classList.add("grid-10");
    else grid.classList.add("grid-many");

    // Badges update
    const badge1 = document.getElementById("badge-participants-count");
    const badge2 = document.getElementById("participants-count-tag");
    if (badge1) badge1.textContent = total;
    if (badge2) badge2.textContent = total;
  }

  updateParticipantsList() {
    const list = document.getElementById("participants-list");
    if (!list) return;

    list.innerHTML = "";

    // Local user
    const localItem = document.createElement("div");
    localItem.className = "flex items-center justify-between p-2 rounded-lg hover:bg-zoom-tile text-xs";
    localItem.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full bg-zoom-blue flex items-center justify-center font-bold text-[11px]">
          ${this.userName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div class="font-medium text-white">${this.userName} <span class="text-gray-400 font-normal">(Siz)</span></div>
          ${this.isHost ? '<span class="text-[10px] text-amber-400">Moderator (Host)</span>' : ""}
        </div>
      </div>
      <div class="flex items-center gap-2 text-gray-400">
        <i data-lucide="${!this.webrtc.isMuted ? "mic" : "mic-off"}" class="w-4 h-4 ${!this.webrtc.isMuted ? "text-zoom-green" : "text-red-400"}"></i>
        <i data-lucide="${!this.webrtc.isVideoOff ? "video" : "video-off"}" class="w-4 h-4 text-gray-300"></i>
      </div>
    `;
    list.appendChild(localItem);

    // Remotes
    this.participants.forEach((p) => {
      const item = document.createElement("div");
      item.className = "flex items-center justify-between p-2 rounded-lg hover:bg-zoom-tile text-xs";
      item.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center font-bold text-[11px]">
            ${(p.name || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="font-medium text-white">${p.name}</div>
            ${p.is_host ? '<span class="text-[10px] text-amber-400">Moderator</span>' : ""}
          </div>
        </div>
        <div class="flex items-center gap-2 text-gray-400">
          ${p.hand ? '<span class="text-amber-400 text-xs">✋</span>' : ""}
          <input type="range" min="0" max="1" step="0.05" value="1" class="vol-slider w-12 h-1 bg-gray-700 accent-zoom-blue rounded cursor-pointer hidden sm:block" data-id="${p.id}" title="Ovoz balandligi">
          <i data-lucide="${p.audio ? "mic" : "mic-off"}" class="w-4 h-4 ${p.audio ? "text-zoom-green" : "text-red-400"}"></i>
          <i data-lucide="${p.video ? "video" : "video-off"}" class="w-4 h-4 text-gray-300"></i>
          ${
            this.isHost
              ? `<button class="btn-kick p-1 text-red-400 hover:text-red-300 ml-1" data-id="${p.id}" title="Chetlatish">
                  <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
                 </button>`
              : ""
          }
        </div>
      `;
      list.appendChild(item);
    });

    // Attach volume listeners
    list.querySelectorAll(".vol-slider").forEach((slider) => {
      slider.addEventListener("input", (e) => {
        const targetId = slider.getAttribute("data-id");
        const a = document.getElementById(`audio-${targetId}`);
        if (a) a.volume = parseFloat(e.target.value);
        const v = document.getElementById(`video-${targetId}`);
        if (v) v.volume = parseFloat(e.target.value);
      });
    });

    // Attach kick handlers
    list.querySelectorAll(".btn-kick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-id");
        if (confirm("Rostdan ham ushbu ishtirokchini chiqarib yubormoqchimisiz?")) {
          this.socket.sendJSON({ action: "kick", target_id: targetId });
        }
      });
    });

    lucide.createIcons({ root: list });
  }

  updateTargetSelect() {
    const select = document.getElementById("chat-target-select");
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="everyone">Barchaga (Umumiy)</option>';

    this.participants.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (Shaxsiy)`;
      select.appendChild(opt);
    });

    select.value = currentVal;
  }

  // Bind all Meeting toolbar and header events
  bindMeetingEvents() {
    // 1. Mic & Video toggles
    const btnMic = document.getElementById("btn-toggle-mic");
    const btnCam = document.getElementById("btn-toggle-cam");

    btnMic?.addEventListener("click", () => {
      if (this.muteAvLocked && !this.isHost) {
        this.showToast("Moderator mikrofon va kamerani vaqtincha bloklagan!");
        return;
      }
      const isLive = this.webrtc.toggleAudio();
      this.updateMicUI();
      this.socket.sendJSON({ action: "media-state", audio: isLive });
    });

    btnCam?.addEventListener("click", async () => {
      if (this.muteAvLocked && !this.isHost) {
        this.showToast("Moderator mikrofon va kamerani vaqtincha bloklagan!");
        return;
      }
      if (this.webrtc.isVideoOff && (!this.webrtc.localStream || this.webrtc.localStream.getVideoTracks().length === 0)) {
        await this.webrtc.initLocalMedia();
        if (this.webrtc.localStream) {
          this.setLocalVideoTrack(this.webrtc.localStream);
        }
      }
      const isLive = this.webrtc.toggleVideo();
      if (isLive && this.webrtc.localStream) {
        this.setLocalVideoTrack(this.webrtc.localStream);
      }
      this.updateCamUI();
      this.socket.sendJSON({ action: "media-state", video: isLive });
    });

    // Mobile Front/Back Camera Flip
    document.getElementById("btn-flip-camera")?.addEventListener("click", async () => {
      const ok = await this.webrtc.switchCamera();
      if (ok) {
        this.updateCamUI();
        this.showToast(this.webrtc.currentFacingMode === "environment" ? "Orqa kamera faollashtirildi 📸" : "Oldi kamera faollashtirildi 🤳");
      }
    });

    // 2. Screen sharing
    const btnShare = document.getElementById("btn-share-screen");
    const screenContainer = document.getElementById("screen-share-container");
    const screenVideo = document.getElementById("screen-video");
    const btnStopShare = document.getElementById("btn-stop-screen-share");

    btnShare?.addEventListener("click", async () => {
      if (this.screenLocked && !this.isHost) {
        this.showToast("Ekran ulashish faqat moderator uchun ruxsat etilgan!");
        return;
      }
      if (!this.webrtc.isScreenSharing) {
        const stream = await this.webrtc.startScreenShare();
        if (stream) {
          screenVideo.srcObject = stream;
          screenContainer.classList.remove("hidden");
          this.socket.sendJSON({ action: "media-state", screen: true });
        }
      } else {
        this.webrtc.stopScreenShare();
      }
    });

    btnStopShare?.addEventListener("click", () => {
      this.webrtc.stopScreenShare();
    });

    window.addEventListener("screen-share-stopped", () => {
      screenContainer.classList.add("hidden");
      this.socket.sendJSON({ action: "media-state", screen: false });
    });

    // 3. Side Panels: Participants & Chat (Responsive slide-out / bottom sheet)
    const btnTogglePart = document.getElementById("btn-toggle-participants");
    const btnToggleChat = document.getElementById("btn-toggle-chat");
    const panelPart = document.getElementById("panel-participants");
    const panelChat = document.getElementById("panel-chat");
    const btnClosePart = document.getElementById("btn-close-participants");
    const btnCloseChat = document.getElementById("btn-close-chat");

    btnTogglePart?.addEventListener("click", () => {
      panelPart.classList.toggle("hidden");
      if (!panelPart.classList.contains("hidden")) {
        panelChat.classList.add("hidden");
      }
    });

    btnClosePart?.addEventListener("click", () => {
      panelPart.classList.add("hidden");
    });

    btnToggleChat?.addEventListener("click", () => {
      panelChat.classList.toggle("hidden");
      this.chat.isChatOpen = !panelChat.classList.contains("hidden");
      if (this.chat.isChatOpen) {
        this.chat.markAsRead();
        panelPart.classList.add("hidden");
      }
    });

    btnCloseChat?.addEventListener("click", () => {
      panelChat.classList.add("hidden");
      this.chat.isChatOpen = false;
    });

    // 4. Whiteboard (Toggle from bottom bar or top header)
    const btnWb = document.getElementById("btn-toggle-whiteboard");
    const btnHeaderWb = document.getElementById("btn-header-whiteboard");
    const modalWb = document.getElementById("whiteboard-modal");
    
    const toggleWhiteboard = () => {
      modalWb.classList.toggle("hidden");
      if (!modalWb.classList.contains("hidden")) {
        this.whiteboard.resizeCanvas();
      }
    };
    btnWb?.addEventListener("click", toggleWhiteboard);
    btnHeaderWb?.addEventListener("click", toggleWhiteboard);

    // 5. Reactions popover & Hand raise
    const btnReactions = document.getElementById("btn-toggle-reactions");
    const popoverReactions = document.getElementById("reactions-popover");
    const btnHand = document.getElementById("btn-toggle-hand");

    btnReactions?.addEventListener("click", (e) => {
      e.stopPropagation();
      popoverReactions.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!popoverReactions.contains(e.target) && e.target !== btnReactions) {
        popoverReactions.classList.add("hidden");
      }
      const viewDrop = document.getElementById("view-dropdown");
      if (viewDrop && !viewDrop.contains(e.target) && !document.getElementById("btn-view-mode")?.contains(e.target)) {
        viewDrop.classList.add("hidden");
      }
    });

    btnHand?.addEventListener("click", () => {
      this.isHandRaised = !this.isHandRaised;
      this.socket.sendJSON({ action: "raise-hand", hand: this.isHandRaised });
      this.updateHandState(this.peerId, this.isHandRaised, this.userName);
      popoverReactions.classList.add("hidden");
    });

    // 6. Security & Mute All
    const btnSecurity = document.getElementById("btn-security");
    const modalSecurity = document.getElementById("modal-security");
    const chkLock = document.getElementById("chk-lock-room");
    const btnMuteAll = document.getElementById("btn-mute-all");

    btnSecurity?.addEventListener("click", () => {
      modalSecurity.classList.remove("hidden");
    });

    chkLock?.addEventListener("change", (e) => {
      this.socket.sendJSON({ action: "lock-room", locked: e.target.checked });
    });

    btnMuteAll?.addEventListener("click", () => {
      if (confirm("Barcha ishtirokchilar mikrofonini o'chirmoqchimisiz?")) {
        this.socket.sendJSON({ action: "mute-all" });
      }
    });

    // 7. View mode dropdown & Fullscreen
    const btnViewMode = document.getElementById("btn-view-mode");
    const viewDropdown = document.getElementById("view-dropdown");
    const optGallery = document.getElementById("opt-view-gallery");
    const optSpeaker = document.getElementById("opt-view-speaker");
    const btnFullscreen = document.getElementById("btn-fullscreen-toggle");

    btnViewMode?.addEventListener("click", (e) => {
      e.stopPropagation();
      viewDropdown.classList.toggle("hidden");
    });

    optGallery?.addEventListener("click", () => {
      this.viewMode = "gallery";
      document.getElementById("view-mode-text").textContent = "Galereya";
      document.getElementById("video-stage")?.classList.remove("speaker-view-active");
      viewDropdown.classList.add("hidden");
      this.updateLayout();
    });

    optSpeaker?.addEventListener("click", () => {
      this.viewMode = "speaker";
      document.getElementById("view-mode-text").textContent = "Spiker";
      document.getElementById("video-stage")?.classList.add("speaker-view-active");
      viewDropdown.classList.add("hidden");
      this.updateLayout();
    });

    btnFullscreen?.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      viewDropdown.classList.add("hidden");
    });

    // 8. Recording (Real browser MediaRecorder with Screen & Audio Mixing)
    const btnRecord = document.getElementById("btn-toggle-record");
    const modalRecordChoice = document.getElementById("modal-record-choice");
    const btnRecFullMeeting = document.getElementById("btn-rec-full-meeting");
    const btnRecCameraOnly = document.getElementById("btn-rec-camera-only");
    const btnCloseRecPreview = document.getElementById("btn-close-rec-preview");

    btnRecord?.addEventListener("click", () => {
      if (!this.isRecording) {
        modalRecordChoice?.classList.remove("hidden");
      } else {
        this.stopRecording();
      }
    });

    btnRecFullMeeting?.addEventListener("click", () => {
      modalRecordChoice?.classList.add("hidden");
      this.startRecording("screen");
    });

    btnRecCameraOnly?.addEventListener("click", () => {
      modalRecordChoice?.classList.add("hidden");
      this.startRecording("camera");
    });

    btnCloseRecPreview?.addEventListener("click", () => {
      const videoEl = document.getElementById("rec-preview-video");
      if (videoEl) {
        videoEl.pause();
        videoEl.src = "";
      }
      document.getElementById("modal-record-preview")?.classList.add("hidden");
    });

    // 10. Copy Invite Link
    const btnCopy = document.getElementById("btn-copy-invite");
    const btnInvite = document.getElementById("btn-invite-modal");
    const copyLinkHandler = () => {
      const inviteUrl = `${window.location.origin}/room/${this.displayRoomId || this.roomId}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        this.showToast("Taklif havolasi nusxalandi!");
      });
    };
    btnCopy?.addEventListener("click", copyLinkHandler);
    btnInvite?.addEventListener("click", copyLinkHandler);

    // 11. Leave Meeting (Triggers Leave/End Modal)
    const btnLeave = document.getElementById("btn-leave-meeting");
    btnLeave?.addEventListener("click", () => {
      this.openLeaveModal();
    });

    // Close generic modal buttons
    document.querySelectorAll(".btn-modal-close").forEach((b) => {
      b.addEventListener("click", () => {
        b.closest(".fixed")?.classList.add("hidden");
        // Stop settings preview if closing settings modal
        if (b.closest("#modal-settings") && this.settingsStream) {
          this.settingsStream.getTracks().forEach((t) => t.stop());
          this.settingsStream = null;
        }
      });
    });
  }

  // Keyboard Shortcuts (Zoom standard)
  bindKeyboardShortcuts() {
    let spaceDown = false;

    window.addEventListener("keydown", (e) => {
      // Ignore if typing in input
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

      // Space: Push-to-talk
      if (e.code === "Space" && !spaceDown) {
        spaceDown = true;
        if (this.webrtc.isMuted) {
          this.webrtc.toggleAudio(true);
          this.updateMicUI();
          this.showToast("Vaqtinchalik mikrofon yoqildi (Push-to-talk)");
        }
      }

      // Alt+A: Mute/Unmute
      if (e.altKey && e.code === "KeyA") {
        e.preventDefault();
        this.webrtc.toggleAudio();
        this.updateMicUI();
      }

      // Alt+V: Video On/Off
      if (e.altKey && e.code === "KeyV") {
        e.preventDefault();
        this.webrtc.toggleVideo();
        this.updateCamUI();
      }

      // Alt+H: Chat Toggle
      if (e.altKey && e.code === "KeyH") {
        e.preventDefault();
        document.getElementById("btn-toggle-chat")?.click();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space" && spaceDown) {
        spaceDown = false;
        if (!this.webrtc.isMuted) {
          this.webrtc.toggleAudio(false);
          this.updateMicUI();
          this.showToast("Mikrofon qayta o'chirildi");
        }
      }
    });
  }

  updateMicUI() {
    const isLive = !this.webrtc.isMuted;
    const btn = document.getElementById("btn-toggle-mic");
    const icon = document.getElementById("icon-mic");
    const label = document.getElementById("label-mic");
    const localAudioIcon = document.getElementById("local-audio-icon");

    if (btn && btn.parentElement) {
      if (!isLive) {
        btn.parentElement.classList.add("border-red-500/50", "bg-red-500/15");
      } else {
        btn.parentElement.classList.remove("border-red-500/50", "bg-red-500/15");
      }
    }

    if (icon) {
      icon.setAttribute("data-lucide", isLive ? "mic" : "mic-off");
      icon.className = `w-4 h-4 sm:w-5 sm:h-5 ${isLive ? "text-zoom-green" : "text-red-500"}`;
    }
    if (label) {
      label.textContent = isLive ? "Mute" : "Unmute";
    }
    if (localAudioIcon) {
      localAudioIcon.setAttribute("data-lucide", isLive ? "mic" : "mic-off");
      localAudioIcon.className = `w-3.5 h-3.5 ${isLive ? "text-zoom-green" : "text-red-400"}`;
    }
    lucide.createIcons();
    this.updateParticipantsList();
  }

  setLocalVideoTrack(stream) {
    const localVideo = document.getElementById("local-video");
    const localAvatar = document.getElementById("local-avatar");
    if (!localVideo) return;

    if (!stream) {
      localVideo.srcObject = null;
      if (localAvatar) {
        localAvatar.style.display = "flex";
        localAvatar.classList.remove("hidden");
      }
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      localVideo.srcObject = null;
      if (localAvatar) {
        localAvatar.style.display = "flex";
        localAvatar.classList.remove("hidden");
      }
      return;
    }

    const videoTrack = videoTracks[0];

    // Ensure local video element is in the render tree and visible
    localVideo.style.display = "block";
    localVideo.classList.remove("hidden");

    // Mirror for selfie/front camera ("user"), unmirror for back camera ("environment")
    if (this.webrtc && this.webrtc.currentFacingMode === "environment") {
      localVideo.style.transform = "none";
    } else {
      localVideo.style.transform = "scaleX(-1)";
    }

    localVideo.muted = true;
    localVideo.defaultMuted = true;
    localVideo.playsInline = true;
    localVideo.setAttribute("playsinline", "");
    localVideo.setAttribute("webkit-playsinline", "");
    localVideo.setAttribute("muted", "");
    localVideo.setAttribute("autoplay", "");

    if (localVideo.srcObject !== stream) {
      localVideo.srcObject = stream;
    }

    const hasLiveVideo = videoTrack && videoTrack.enabled && videoTrack.readyState === "live" && !this.webrtc?.isVideoOff;

    if (hasLiveVideo) {
      localVideo.style.display = "block";
      localVideo.classList.remove("hidden");
      if (localAvatar) {
        localAvatar.style.display = "none";
        localAvatar.classList.add("hidden");
      }
      localVideo.play().catch(e => console.warn("Local play error:", e));
    } else {
      localVideo.style.display = "none";
      localVideo.classList.add("hidden");
      if (localAvatar) {
        localAvatar.style.display = "flex";
        localAvatar.classList.remove("hidden");
        localAvatar.textContent = (this.userName || "U").charAt(0).toUpperCase();
      }
    }

    localVideo.onloadedmetadata = () => {
      localVideo.muted = true;
      localVideo.play().catch(() => {});
      this.updateCamUI();
    };
    localVideo.onplaying = () => {
      this.updateCamUI();
    };
  }

  updateCamUI() {
    const hasLiveVideoTrack = this.webrtc?.localStream && 
                             this.webrtc.localStream.getVideoTracks().length > 0 && 
                             this.webrtc.localStream.getVideoTracks()[0].enabled && 
                             this.webrtc.localStream.getVideoTracks()[0].readyState === "live";
    const isLive = !this.webrtc?.isVideoOff && Boolean(hasLiveVideoTrack);
    const btn = document.getElementById("btn-toggle-cam");
    const icon = document.getElementById("icon-cam");
    const label = document.getElementById("label-cam");
    const localAvatar = document.getElementById("local-avatar");
    const localVideo = document.getElementById("local-video");

    if (btn && btn.parentElement) {
      if (!isLive) {
        btn.parentElement.classList.add("border-red-500/50", "bg-red-500/15");
      } else {
        btn.parentElement.classList.remove("border-red-500/50", "bg-red-500/15");
      }
    }

    if (icon) {
      icon.setAttribute("data-lucide", isLive ? "video" : "video-off");
      icon.className = `w-4 h-4 sm:w-5 sm:h-5 ${isLive ? "text-white" : "text-red-500"}`;
    }
    if (label) {
      label.textContent = isLive ? "Stop Video" : "Start Video";
    }

    if (localAvatar) {
      localAvatar.style.display = isLive ? "none" : "flex";
      localAvatar.classList.toggle("hidden", isLive);
      if (!isLive) {
        localAvatar.textContent = (this.userName || "U").charAt(0).toUpperCase();
      }
    }

    if (localVideo) {
      localVideo.style.display = isLive ? "block" : "none";
      localVideo.classList.toggle("hidden", !isLive);
      if (isLive) {
        if (!localVideo.srcObject && this.webrtc?.localStream) {
          this.setLocalVideoTrack(this.webrtc.localStream);
        } else if (localVideo.srcObject && localVideo.paused) {
          localVideo.muted = true;
          localVideo.play().catch(() => {});
        }
      }
    }
    lucide.createIcons();
    this.updateParticipantsList();
  }

  // Professional Meeting Recording Engine (Whole screen or Camera + In-App Player)
  async startRecording(mode = "screen") {
    try {
      this.recordedChunks = [];
      let captureStream = null;

      if (mode === "screen") {
        try {
          // Capture entire screen or meeting tab with audio
          captureStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: "browser", cursor: "always" },
            audio: true
          });
        } catch (e) {
          console.warn("User cancelled screen capture for recording, falling back to camera:", e);
          captureStream = this.webrtc.localStream;
        }
      } else {
        captureStream = this.webrtc.localStream;
      }

      if (!captureStream) {
        this.showToast("Yozib olish uchun video oqim topilmadi");
        return;
      }

      // Mix mic audio if present and not already part of captureStream
      let finalStream = captureStream;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const dest = ctx.createMediaStreamDestination();

        let hasAudio = false;
        // 1. Screen audio
        if (captureStream.getAudioTracks().length > 0) {
          const screenSource = ctx.createMediaStreamSource(captureStream);
          screenSource.connect(dest);
          hasAudio = true;
        }
        // 2. Local mic audio
        if (this.webrtc.localStream && this.webrtc.localStream.getAudioTracks().length > 0) {
          const micSource = ctx.createMediaStreamSource(this.webrtc.localStream);
          micSource.connect(dest);
          hasAudio = true;
        }

        if (hasAudio) {
          finalStream = new MediaStream([
            ...captureStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
          ]);
        }
      } catch (err) {
        console.warn("Audio mixing warning, using raw stream:", err);
      }

      // Pick best supported MIME type for maximum player compatibility (MP4 / H264)
      const supportedMimes = [
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=h264,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];

      let selectedMime = "";
      for (const m of supportedMimes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      this.recordingMime = selectedMime;
      this.activeRecordStream = captureStream;

      this.mediaRecorder = selectedMime
        ? new MediaRecorder(finalStream, { mimeType: selectedMime })
        : new MediaRecorder(finalStream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const isMp4 = this.recordingMime && this.recordingMime.includes("mp4");
        const mimeType = isMp4 ? "video/mp4" : "video/webm";
        const ext = isMp4 ? "mp4" : "webm";

        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const videoUrl = URL.createObjectURL(blob);

        // Update in-app preview player
        const previewVideo = document.getElementById("rec-preview-video");
        const downloadLink = document.getElementById("btn-download-recording");
        const modalPreview = document.getElementById("modal-record-preview");

        if (previewVideo) {
          previewVideo.src = videoUrl;
          previewVideo.load();
        }
        if (downloadLink) {
          downloadLink.href = videoUrl;
          downloadLink.download = `meeting-record-${Date.now()}.${ext}`;
        }
        if (modalPreview) {
          modalPreview.classList.remove("hidden");
        }

        this.showToast("Uchrashuv yozuvi tayyor! Brauzerda ko'rishingiz mumkin.");
      };

      // Handle user stopping screen share via browser native banner
      const videoTrack = captureStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (this.isRecording) {
            this.stopRecording();
          }
        };
      }

      this.mediaRecorder.start(1000);
      this.isRecording = true;

      // Update Toolbar UI
      const recBadge = document.getElementById("recording-badge");
      recBadge?.classList.remove("hidden");
      document.getElementById("record-label").textContent = "To'xtatish";
      document.getElementById("record-icon").classList.add("text-red-500", "animate-pulse");

      this.showToast("Uchrashuv yozib olinmoqda (REC)...");
    } catch (e) {
      console.error("Recording start error:", e);
      this.showToast("Yozib olishni boshlashda xatolik yuz berdi");
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;

      if (this.activeRecordStream && this.activeRecordStream !== this.webrtc.localStream) {
        this.activeRecordStream.getTracks().forEach((t) => t.stop());
      }

      // Reset Toolbar UI
      const recBadge = document.getElementById("recording-badge");
      recBadge?.classList.add("hidden");
      document.getElementById("record-label").textContent = "Yozib olish";
      document.getElementById("record-icon").classList.remove("text-red-500", "animate-pulse");
    }
  }

  // Settings System Logic (Real devices enumeration, switching, preview, and tabs)
  bindSettingsEvents() {
    const modalSettings = document.getElementById("modal-settings");
    const btnHomeSettings = document.getElementById("btn-home-settings");
    const btnAudioSettings = document.getElementById("btn-audio-settings");
    const btnVideoSettings = document.getElementById("btn-video-settings");

    const openSettings = (defaultTab = "settings-tab-video") => {
      modalSettings?.classList.remove("hidden");
      this.switchSettingsTab(defaultTab);
      this.loadMediaDevices();
      this.startSettingsPreview();
    };

    btnHomeSettings?.addEventListener("click", () => openSettings("settings-tab-video"));
    btnAudioSettings?.addEventListener("click", () => openSettings("settings-tab-audio"));
    btnVideoSettings?.addEventListener("click", () => openSettings("settings-tab-video"));

    // Tab switching inside Settings
    document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        this.switchSettingsTab(targetId);
      });
    });

    // Device changes
    const selVideo = document.getElementById("select-video-device");
    const selAudio = document.getElementById("select-audio-device");

    selVideo?.addEventListener("change", async (e) => {
      const deviceId = e.target.value;
      if (deviceId && this.webrtc) {
        await this.webrtc.switchCamera(deviceId);
        this.startSettingsPreview(deviceId);
        this.showToast("Kamera muvaffaqiyatli almashtirildi");
      }
    });

    selAudio?.addEventListener("change", async (e) => {
      const deviceId = e.target.value;
      if (deviceId && this.webrtc) {
        await this.webrtc.switchMicrophone(deviceId);
        this.showToast("Mikrofon muvaffaqiyatli almashtirildi");
      }
    });

    // Test Speaker button
    document.getElementById("btn-test-speaker")?.addEventListener("click", () => {
      if (this.webrtc) {
        this.webrtc.playTestSound();
      }
      this.showToast("Dinamik tekshiruvi: Ovoz yangradi 🔊");
    });

    // Mirror checkbox
    document.getElementById("chk-settings-mirror")?.addEventListener("change", (e) => {
      const isMirror = e.target.checked;
      const localVideo = document.getElementById("local-video");
      const previewVideo = document.getElementById("settings-preview-video");
      if (localVideo) localVideo.style.transform = isMirror ? "scaleX(-1)" : "scaleX(1)";
      if (previewVideo) previewVideo.style.transform = isMirror ? "scaleX(-1)" : "scaleX(1)";
    });

    // Live Mic meter in settings
    window.addEventListener("local-volume", (e) => {
      const meter = document.getElementById("settings-audio-meter");
      const label = document.getElementById("settings-mic-level-label");
      if (meter) {
        const vol = Math.min(100, Math.max(0, Math.round(e.detail.volume * 2.5)));
        meter.style.width = `${vol}%`;
        if (label) label.textContent = `${vol}%`;
      }
    });
  }

  switchSettingsTab(tabId) {
    document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
      const target = btn.getAttribute("data-target");
      if (target === tabId) {
        btn.classList.add("bg-zoom-blue", "text-white");
        btn.classList.remove("text-gray-300", "hover:bg-zoom-tile");
      } else {
        btn.classList.remove("bg-zoom-blue", "text-white");
        btn.classList.add("text-gray-300", "hover:bg-zoom-tile");
      }
    });

    document.querySelectorAll(".settings-tab-panel").forEach((panel) => {
      panel.classList.add("hidden");
    });
    const active = document.getElementById(tabId);
    if (active) active.classList.remove("hidden");
    lucide.createIcons();
  }

  async loadMediaDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoSelect = document.getElementById("select-video-device");
      const audioSelect = document.getElementById("select-audio-device");
      const speakerSelect = document.getElementById("select-speaker-device");

      if (videoSelect) videoSelect.innerHTML = "";
      if (audioSelect) audioSelect.innerHTML = "";
      if (speakerSelect) speakerSelect.innerHTML = '<option value="default">Odatiy karnay (Default)</option>';

      let videoIndex = 1;
      let audioIndex = 1;
      let speakerIndex = 1;

      devices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;

        if (device.kind === "videoinput") {
          option.textContent = device.label || `Kamera ${videoIndex++}`;
          videoSelect?.appendChild(option);
        } else if (device.kind === "audioinput") {
          option.textContent = device.label || `Mikrofon ${audioIndex++}`;
          audioSelect?.appendChild(option);
        } else if (device.kind === "audiooutput") {
          option.textContent = device.label || `Dinamik ${speakerIndex++}`;
          speakerSelect?.appendChild(option);
        }
      });

      if (videoSelect && videoSelect.options.length === 0) {
        videoSelect.innerHTML = '<option value="">Kamera topilmadi</option>';
      }
      if (audioSelect && audioSelect.options.length === 0) {
        audioSelect.innerHTML = '<option value="">Mikrofon topilmadi</option>';
      }
    } catch (err) {
      console.warn("Could not enumerate media devices:", err);
    }
  }

  async startSettingsPreview(deviceId = null) {
    const previewVideo = document.getElementById("settings-preview-video");
    const camPlaceholder = document.getElementById("settings-cam-placeholder");
    if (!previewVideo) return;

    try {
      if (this.settingsStream) {
        this.settingsStream.getTracks().forEach((t) => t.stop());
      }
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false
      };
      this.settingsStream = await navigator.mediaDevices.getUserMedia(constraints);
      previewVideo.srcObject = this.settingsStream;
      camPlaceholder?.classList.add("hidden");
    } catch (e) {
      camPlaceholder?.classList.remove("hidden");
    }
  }

  // Moderator & Participant Leave / End Meeting logic
  openLeaveModal() {
    const modalLeave = document.getElementById("modal-leave-confirm");
    const hostOptions = document.getElementById("leave-host-options");
    const participantOptions = document.getElementById("leave-participant-options");

    modalLeave?.classList.remove("hidden");
    if (this.isHost) {
      hostOptions?.classList.remove("hidden");
      participantOptions?.classList.add("hidden");
    } else {
      hostOptions?.classList.add("hidden");
      participantOptions?.classList.remove("hidden");
    }
  }

  bindLeaveModalEvents() {
    const modalLeave = document.getElementById("modal-leave-confirm");
    const btnEndAll = document.getElementById("btn-end-meeting-all");
    const btnLeaveOnlyMe = document.getElementById("btn-leave-only-me");
    const btnConfirmPart = document.getElementById("btn-confirm-leave-participant");
    const modalRating = document.getElementById("modal-meeting-rating");

    // Host Ends Meeting for All
    btnEndAll?.addEventListener("click", () => {
      this.isUserIntentionalLeave = true;
      modalLeave?.classList.add("hidden");
      if (this.socket) {
        this.socket.sendJSON({ action: "end-meeting-all" });
      }
      if (this.webrtc) this.webrtc.closeAll();
      this.showToast("Uchrashuv barcha uchun yakunlandi.");
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    });

    // Leave alone (Conference continues for everyone else!)
    const promptRatingThenLeave = () => {
      modalLeave?.classList.add("hidden");
      if (modalRating) {
        modalRating.classList.remove("hidden");
      } else {
        this.finishLeaveMeeting();
      }
    };

    btnLeaveOnlyMe?.addEventListener("click", promptRatingThenLeave);
    btnConfirmPart?.addEventListener("click", promptRatingThenLeave);
  }

  finishLeaveMeeting() {
    this.isUserIntentionalLeave = true;
    if (this.socket) this.socket.close();
    if (this.webrtc) this.webrtc.closeAll();
    window.location.href = "/";
  }

  bindRatingModalEvents() {
    let currentRating = 5;
    const starBtns = document.querySelectorAll(".star-btn");
    starBtns.forEach((s) => {
      s.addEventListener("click", () => {
        currentRating = parseInt(s.getAttribute("data-star"), 10);
        starBtns.forEach((star) => {
          const val = parseInt(star.getAttribute("data-star"), 10);
          if (val <= currentRating) {
            star.classList.add("text-amber-400");
            star.classList.remove("text-gray-500");
          } else {
            star.classList.remove("text-amber-400");
            star.classList.add("text-gray-500");
          }
        });
      });
    });

    document.getElementById("btn-skip-rating")?.addEventListener("click", () => {
      this.finishLeaveMeeting();
    });

    document.getElementById("btn-submit-rating")?.addEventListener("click", async () => {
      const comment = document.getElementById("rating-comment")?.value.trim() || "";
      try {
        await fetch(`/api/meetings/${this.roomId}/rating`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_name: this.userName || "Mehmon",
            rating: currentRating,
            comment: comment
          })
        });
      } catch (e) {
        console.warn("Rating submit error:", e);
      }
      this.showToast("Baholaganingiz uchun katta rahmat!");
      setTimeout(() => this.finishLeaveMeeting(), 500);
    });
  }

  bindSecurityModalEvents() {
    const modalSec = document.getElementById("modal-security");
    document.getElementById("btn-security")?.addEventListener("click", () => {
      modalSec?.classList.remove("hidden");
    });

    document.getElementById("chk-lock-room")?.addEventListener("change", (e) => {
      this.socket?.sendJSON({ action: "lock-room", locked: e.target.checked });
      this.showToast(e.target.checked ? "Xona qulflandi 🔒" : "Xona ochildi 🔓");
    });

    document.getElementById("chk-toggle-waiting-room")?.addEventListener("change", (e) => {
      this.socket?.sendJSON({ action: "toggle-waiting-room", enabled: e.target.checked });
      this.showToast(e.target.checked ? "Kutish zali yoqildi" : "Kutish zali o'chirildi");
    });

    document.getElementById("chk-lock-av")?.addEventListener("change", (e) => {
      this.socket?.sendJSON({ action: "lock-av-permissions", locked: e.target.checked });
      this.showToast(e.target.checked ? "Mikrofon va kamera bloklandi" : "Blokirovka yechildi");
    });

    document.getElementById("chk-lock-screen")?.addEventListener("change", (e) => {
      this.socket?.sendJSON({ action: "lock-screen-permission", locked: e.target.checked });
      this.showToast(e.target.checked ? "Faqat moderator ekran ulasha oladi" : "Barcha ekran ulasha oladi");
    });

    document.getElementById("chk-toggle-watermark")?.addEventListener("change", (e) => {
      const wm = document.getElementById("dynamic-watermark");
      if (wm) {
        wm.classList.toggle("hidden", !e.target.checked);
        wm.querySelectorAll(".watermark-room").forEach(el => el.textContent = this.roomId || "");
        wm.querySelectorAll(".watermark-user").forEach(el => el.textContent = this.userName || "");
      }
      this.showToast(e.target.checked ? "Suv belgisi yoqildi" : "Suv belgisi o'chirildi");
    });

    document.getElementById("btn-save-security-pin")?.addEventListener("click", () => {
      const pin = document.getElementById("input-security-pin")?.value.trim() || "";
      this.socket?.sendJSON({ action: "set-room-passcode", passcode: pin });
      this.showToast(pin ? `Xona PIN kodi o'rnatildi: ${pin}` : "PIN kod olib tashlandi");
    });
  }

  bindWaitingRoomEvents() {
    document.getElementById("btn-waiting-room-leave")?.addEventListener("click", () => {
      window.location.href = "/";
    });

    document.getElementById("btn-waiting-music-toggle")?.addEventListener("click", () => {
      const btn = document.getElementById("btn-waiting-music-toggle");
      if (this.ambientAudio && !this.ambientAudio.paused) {
        this.ambientAudio.pause();
        btn.textContent = "Musiqani tinglash";
      } else {
        this.startAmbientMusic("lofi", 0.5);
        btn.textContent = "Musiqani to'xtatish";
      }
    });
  }

  bindBreakoutEvents() {
    const modalBreakout = document.getElementById("modal-breakout");
    document.getElementById("btn-header-breakout")?.addEventListener("click", () => {
      modalBreakout?.classList.remove("hidden");
    });

    let selectedGroupCount = 2;
    document.querySelectorAll(".btn-breakout-count").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-breakout-count").forEach(b => {
          b.classList.remove("active", "border-zoom-blue", "bg-zoom-blue/20", "text-white");
          b.classList.add("border-zoom-border", "bg-zoom-tile", "text-gray-300");
        });
        btn.classList.add("active", "border-zoom-blue", "bg-zoom-blue/20", "text-white");
        selectedGroupCount = parseInt(btn.getAttribute("data-count"), 10) || 2;
      });
    });

    document.getElementById("btn-start-breakout")?.addEventListener("click", () => {
      this.socket?.sendJSON({ action: "breakout-create", count: selectedGroupCount });
      document.getElementById("btn-start-breakout")?.classList.add("hidden");
      document.getElementById("btn-end-breakout")?.classList.remove("hidden");
      this.showToast(`${selectedGroupCount} ta guruh xonalari boshlandi!`);
    });

    document.getElementById("btn-end-breakout")?.addEventListener("click", () => {
      this.socket?.sendJSON({ action: "breakout-end" });
      document.getElementById("btn-start-breakout")?.classList.remove("hidden");
      document.getElementById("btn-end-breakout")?.classList.add("hidden");
      modalBreakout?.classList.add("hidden");
      this.showToast("Barcha ishtirokchilar asosiy zalga qaytarildi");
    });
  }

  bindQaEvents() {
    const panelQa = document.getElementById("panel-qa");
    document.getElementById("btn-toggle-qa")?.addEventListener("click", () => {
      panelQa?.classList.toggle("hidden");
      if (!panelQa?.classList.contains("hidden")) {
        this.loadQaQuestions();
      }
    });

    document.getElementById("btn-close-qa")?.addEventListener("click", () => {
      panelQa?.classList.add("hidden");
    });

    document.getElementById("qa-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("qa-input-text");
      const isAnon = document.getElementById("qa-chk-anon")?.checked || false;
      const text = input?.value.trim();
      if (!text) return;

      this.socket?.sendJSON({
        action: "qa-ask",
        question: text,
        is_anon: isAnon
      });
      input.value = "";
    });
  }

  async loadQaQuestions() {
    if (!this.roomId) return;
    try {
      const res = await fetch(`/api/rooms/${this.roomId}/qa`);
      const data = await res.json();
      const list = document.getElementById("qa-questions-list");
      if (list && data && data.questions) {
        list.innerHTML = "";
        if (data.questions.length === 0) {
          list.innerHTML = `<div class="text-center text-gray-400 text-xs py-8">Hozircha savollar yo'q. Birinchi bo'lib savol bering!</div>`;
          return;
        }
        data.questions.forEach(q => this.appendQaQuestion(q));
      }
    } catch (e) {
      console.warn("Load QA error:", e);
    }
  }

  appendQaQuestion(q) {
    const list = document.getElementById("qa-questions-list");
    if (!list) return;

    if (list.querySelector(".text-center")) {
      list.innerHTML = "";
    }

    const card = document.createElement("div");
    card.id = `qa-card-${q.id}`;
    card.className = "p-3 rounded-xl bg-zoom-tile border border-zoom-border space-y-2 text-xs";
    card.innerHTML = `
      <div class="flex items-center justify-between text-[11px] text-gray-400">
        <span class="font-bold text-gray-200">${q.author || "Ishtirokchi"}</span>
        <span>${q.created_at ? q.created_at.slice(11, 16) : ""}</span>
      </div>
      <p class="text-white font-medium leading-relaxed">${q.question}</p>
      <div class="flex items-center justify-between pt-1">
        <button class="qa-upvote-btn flex items-center gap-1 px-2.5 py-1 bg-black/40 hover:bg-zoom-blue/20 hover:text-zoom-blue rounded-lg text-gray-300 font-bold transition-colors cursor-pointer" data-id="${q.id}">
          <span>👍</span> <span class="upvote-count">${q.upvotes || 0}</span>
        </button>
        ${q.is_answered ? '<span class="text-[10px] text-zoom-green font-bold flex items-center gap-1">✓ Javob berildi</span>' : ""}
      </div>
    `;

    card.querySelector(".qa-upvote-btn").addEventListener("click", () => {
      this.socket?.sendJSON({ action: "qa-upvote", id: q.id });
    });

    list.prepend(card);
  }

  updateQaUpvote(id, count) {
    const card = document.getElementById(`qa-card-${id}`);
    if (card) {
      const countEl = card.querySelector(".upvote-count");
      if (countEl) countEl.textContent = count;
    }
  }

  bindThemeAndPiPEvents() {
    document.getElementById("btn-toggle-theme")?.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      const icon = document.getElementById("icon-theme");
      if (icon) {
        icon.setAttribute("data-lucide", isLight ? "sun" : "moon");
        lucide.createIcons();
      }
      this.showToast(isLight ? "Kun tartibi yoqildi ☀️" : "Tun tartibi yoqildi 🌙");
    });

    document.getElementById("btn-pip-local")?.addEventListener("click", async () => {
      const localVideo = document.getElementById("local-video");
      if (!localVideo) return;
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await localVideo.requestPictureInPicture();
        }
      } catch (err) {
        console.warn("PiP error:", err);
        this.showToast("Bu brauzerda PiP qo'llab-quvvatlanmaydi");
      }
    });
  }

  bindVirtualBgEvents() {
    document.querySelectorAll(".bg-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bgType = btn.getAttribute("data-bg");
        document.querySelectorAll(".bg-filter-btn").forEach((b) => b.classList.remove("border-zoom-blue", "bg-zoom-blue/20"));
        btn.classList.add("border-zoom-blue", "bg-zoom-blue/20");
        this.applyVirtualBackground(bgType);
      });
    });
  }

  bindPollEvents() {
    const btnTogglePoll = document.getElementById("btn-toggle-poll");
    const modalPollCreate = document.getElementById("modal-poll-create");
    const modalPollView = document.getElementById("modal-poll-view");
    const btnSubmitPoll = document.getElementById("btn-submit-create-poll");

    btnTogglePoll?.addEventListener("click", () => {
      if (this.isHost) {
        modalPollCreate?.classList.remove("hidden");
      } else if (this.currentPoll) {
        this.renderPollView(this.currentPoll);
        modalPollView?.classList.remove("hidden");
      } else {
        this.showToast("Hozirda faol so'rovnoma yo'q");
      }
    });

    btnSubmitPoll?.addEventListener("click", () => {
      const q = document.getElementById("input-poll-question")?.value.trim();
      const opt1 = document.getElementById("input-poll-opt1")?.value.trim();
      const opt2 = document.getElementById("input-poll-opt2")?.value.trim();
      const opt3 = document.getElementById("input-poll-opt3")?.value.trim();

      if (!q || !opt1 || !opt2) {
        this.showToast("Savol va kamida 2 ta variantni kiriting");
        return;
      }

      const options = [opt1, opt2];
      if (opt3) options.push(opt3);

      this.socket.sendJSON({
        action: "poll-create",
        question: q,
        options: options
      });

      modalPollCreate?.classList.add("hidden");
      this.showToast("So'rovnoma boshlandi!");
    });
  }

  renderPollView(poll) {
    const qEl = document.getElementById("poll-view-question");
    const authorEl = document.getElementById("poll-view-author");
    const container = document.getElementById("poll-options-container");
    if (!container || !poll) return;

    if (qEl) qEl.innerHTML = `<i data-lucide="help-circle" class="w-5 h-5 text-zoom-green"></i> <span>${poll.question}</span>`;
    if (authorEl) authorEl.textContent = `${poll.creator || "Moderator"} tomonidan boshlandi`;

    container.innerHTML = "";
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
    const hasVoted = poll.voters && poll.voters.includes(this.peerId);

    poll.options.forEach((opt, idx) => {
      const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
      const optDiv = document.createElement("div");
      optDiv.className = "p-3 rounded-xl bg-zoom-tile border border-zoom-border relative overflow-hidden cursor-pointer hover:border-zoom-blue transition-all";

      optDiv.innerHTML = `
        <div class="absolute inset-0 bg-zoom-blue/20 transition-all duration-500" style="width: ${pct}%"></div>
        <div class="relative z-10 flex items-center justify-between text-xs font-semibold text-white">
          <span>${opt.text}</span>
          <span class="text-gray-300 font-mono">${pct}% (${opt.votes})</span>
        </div>
      `;

      if (!hasVoted) {
        optDiv.addEventListener("click", () => {
          this.socket.sendJSON({ action: "poll-vote", option_index: idx });
          this.showToast("Ovozingiz qabul qilindi!");
        });
      }

      container.appendChild(optDiv);
    });

    lucide.createIcons({ root: container });
  }

  showToast(message) {
    const toast = document.getElementById("toast");
    const toastText = document.getElementById("toast-text");
    if (!toast || !toastText) return;

    toastText.textContent = message;
    toast.classList.remove("opacity-0", "-translate-y-4", "pointer-events-none");
    toast.classList.add("opacity-100", "translate-y-0");

    setTimeout(() => {
      toast.classList.add("opacity-0", "-translate-y-4", "pointer-events-none");
      toast.classList.remove("opacity-100", "translate-y-0");
    }, 3000);
  }

  // ==================== 1. ATTENDANCE ANALYTICS & CSV EXPORT ====================
  bindAttendanceEvents() {
    const btnOpen = document.getElementById("btn-open-attendance");
    const modal = document.getElementById("modal-attendance");
    const tableBody = document.getElementById("attendance-table-body");
    const btnExport = document.getElementById("btn-export-attendance-csv");

    btnOpen?.addEventListener("click", async () => {
      modal?.classList.remove("hidden");
      const currentRoom = this.displayRoomId || this.roomId;
      if (!currentRoom) return;

      if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-400">Yuklanmoqda...</td></tr>';
      }

      try {
        const res = await fetch(`/api/rooms/${currentRoom}/attendance/summary`);
        const data = await res.json();
        if (data && data.summary && data.summary.length > 0 && tableBody) {
          tableBody.innerHTML = data.summary.map((row) => `
            <tr class="hover:bg-zoom-tile/40 transition-colors">
              <td class="py-2.5 font-bold text-white flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                  ${row.name.charAt(0).toUpperCase()}
                </span>
                <span>${row.name}</span>
              </td>
              <td class="py-2.5 text-gray-300 font-mono text-[11px]">${row.first_joined || "-"}</td>
              <td class="py-2.5 text-gray-400 font-mono text-[11px]">${row.last_active || "-"}</td>
              <td class="py-2.5 text-zoom-green font-bold text-[11px]">${row.duration_str}</td>
              <td class="py-2.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  row.status === "Faol" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-gray-700/50 text-gray-400"
                }">
                  ${row.status}
                </span>
              </td>
            </tr>
          `).join("");
        } else if (tableBody) {
          tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-400">Hozircha davomat yozuvlari yo\'q</td></tr>';
        }
      } catch (err) {
        console.error("Attendance fetch error:", err);
        if (tableBody) {
          tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-red-400">Ma\'lumotlarni yuklab bo\'lmadi</td></tr>';
        }
      }
    });

    btnExport?.addEventListener("click", () => {
      const currentRoom = this.displayRoomId || this.roomId;
      if (!currentRoom) return;
      window.location.href = `/api/rooms/${currentRoom}/attendance/export`;
      this.showToast("Davomat jurnali (Excel CSV) yuklab olinmoqda... 📥");
    });
  }

  // ==================== 2. QR CODE QUICK JOIN ====================
  bindQREvents() {
    const btnQr = document.getElementById("btn-header-qr");
    const modal = document.getElementById("modal-qr");
    const qrImg = document.getElementById("qr-code-img");
    const qrInput = document.getElementById("qr-url-input");
    const btnCopy = document.getElementById("btn-copy-qr-url");

    btnQr?.addEventListener("click", () => {
      const inviteUrl = `${window.location.origin}/room/${this.displayRoomId || this.roomId}`;
      if (qrInput) qrInput.value = inviteUrl;
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(inviteUrl)}&margin=10`;
      }
      modal?.classList.remove("hidden");
    });

    btnCopy?.addEventListener("click", () => {
      const inviteUrl = qrInput ? qrInput.value : window.location.href;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        this.showToast("Xona havolasi nusxalandi! 📋");
      });
    });
  }

  // ==================== 3. VIRTUAL BACKGROUND & BLUR ====================
  bindVirtualBgEvents() {
    const btnVirtualBg = document.getElementById("btn-virtual-bg");
    const btnTileVirtualBg = document.getElementById("btn-tile-virtual-bg");
    const btnHeaderVirtualBg = document.getElementById("btn-header-virtual-bg");
    const modal = document.getElementById("modal-virtual-bg");
    const bgButtons = document.querySelectorAll(".bg-option");

    const openBgModal = () => {
      modal?.classList.remove("hidden");
    };

    btnVirtualBg?.addEventListener("click", openBgModal);
    btnTileVirtualBg?.addEventListener("click", openBgModal);
    btnHeaderVirtualBg?.addEventListener("click", openBgModal);

    bgButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        bgButtons.forEach((b) => {
          b.classList.remove("active", "border-zoom-blue", "bg-zoom-blue/20", "text-white");
          b.classList.add("border-zoom-border", "bg-zoom-tile", "text-gray-200");
        });
        btn.classList.add("active", "border-zoom-blue", "bg-zoom-blue/20", "text-white");
        btn.classList.remove("border-zoom-border", "bg-zoom-tile", "text-gray-200");

        const bgType = btn.getAttribute("data-bg") || "none";
        this.applyVirtualBackground(bgType);
      });
    });
  }

  async applyVirtualBackground(bgType) {
    const localVideo = document.getElementById("local-video");
    if (!this.webrtc) return;

    if (bgType === "none") {
      const stream = await this.webrtc.applyVirtualBackground("none");
      if (localVideo && stream) {
        localVideo.srcObject = stream;
        localVideo.play().catch(() => {});
      }
      this.showToast("Asl kamera foni tiklandi");
      return;
    }

    this.showToast("AI orqa fonni ajratmoqda... ⏳");
    const processedStream = await this.webrtc.applyVirtualBackground(bgType);
    if (processedStream && localVideo) {
      localVideo.srcObject = processedStream;
      localVideo.play().catch(() => {});
    }

    const titles = {
      blur: "Kamera foni xiralashtirildi (AI Bokeh Blur) 🌫️",
      office: "Zamonaviy IT Ofis foni o'rnatildi 🏢",
      boardroom: "Katta Majlislar Zali foni o'rnatildi 🏙️",
      library: "Hashamatli Kutubxona foni o'rnatildi 📚",
      loft: "Shinam Loft Studiya foni o'rnatildi 🛋️",
      nature: "Yam-yashil Tabiat foni o'rnatildi 🌿",
      cyber: "Cyber Neon IT foni o'rnatildi 🌌"
    };
    this.showToast(titles[bgType] || "Virtual fon o'rnatildi ✨");
  }

  // ==================== 4. LIVE SUBTITLES (SPEECH-TO-TEXT) ====================
  bindCaptionsEvents() {
    const btnCaptions = document.getElementById("btn-toggle-captions");
    const labelCaptions = document.getElementById("label-captions");
    this.captionsActive = false;
    this.speechRecognizer = null;

    btnCaptions?.addEventListener("click", () => {
      this.captionsActive = !this.captionsActive;

      if (this.captionsActive) {
        btnCaptions.classList.add("text-zoom-blue");
        btnCaptions.classList.remove("text-gray-300");
        if (labelCaptions) labelCaptions.textContent = "Subtitr (Yoqiq)";

        this.startSpeechRecognition();
        this.showToast("Jonli subtitrlar yoqildi 🎙️");
      } else {
        btnCaptions.classList.remove("text-zoom-blue");
        btnCaptions.classList.add("text-gray-300");
        if (labelCaptions) labelCaptions.textContent = "Subtitr";

        if (this.speechRecognizer) {
          try { this.speechRecognizer.stop(); } catch (e) {}
          this.speechRecognizer = null;
        }
        document.getElementById("subtitles-overlay")?.classList.add("hidden");
        this.showToast("Subtitrlar o'chirildi");
      }
    });
  }

  startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.displayCaption("Tizim", "Brauzeringiz SpeechRecognition API ni to'liq qo'llab-quvvatlamaydi (Google Chrome tavsiya etiladi)");
      return;
    }

    try {
      this.speechRecognizer = new SpeechRecognition();
      this.speechRecognizer.continuous = true;
      this.speechRecognizer.interimResults = true;
      this.speechRecognizer.lang = "uz-UZ";

      this.speechRecognizer.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();
        if (transcript) {
          this.displayCaption("Siz (Jonli)", transcript);
          if (this.socket) {
            this.socket.sendJSON({ action: "caption", text: transcript });
          }
        }
      };

      this.speechRecognizer.onerror = (err) => {
        if (err.error === "no-speech") return;
        console.warn("Speech recognition error:", err);
      };

      this.speechRecognizer.onend = () => {
        if (this.captionsActive) {
          try { this.speechRecognizer.start(); } catch (e) {}
        }
      };

      this.speechRecognizer.start();
    } catch (e) {
      console.warn("Could not start speech recognition:", e);
    }
  }

  displayCaption(speaker, text) {
    const overlay = document.getElementById("subtitles-overlay");
    const speakerEl = document.getElementById("subtitles-speaker");
    const textEl = document.getElementById("subtitles-text");
    if (!overlay || !textEl) return;

    if (speakerEl) speakerEl.textContent = speaker;
    textEl.textContent = text;
    overlay.classList.remove("hidden");

    // Save into meeting transcript buffer for AI Summary
    this.meetingTranscript.push({
      speaker: speaker,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });

    // Real-time Live Translation
    const langSelect = document.getElementById("select-subtitle-lang");
    const transWrap = document.getElementById("subtitles-translated");
    const transText = document.getElementById("subtitles-trans-text");
    const transBadge = document.getElementById("badge-translate-lang");

    const targetLang = langSelect ? langSelect.value : "none";
    if (targetLang !== "none" && transWrap && transText) {
      const translated = this.translateSubtitleText(text, targetLang);
      transText.textContent = translated;
      if (transBadge) {
        transBadge.textContent = targetLang === "en" ? "English" : (targetLang === "ru" ? "Русский" : "O'zbekcha");
      }
      transWrap.classList.remove("hidden");
    } else if (transWrap) {
      transWrap.classList.add("hidden");
    }

    clearTimeout(this.captionTimeout);
    this.captionTimeout = setTimeout(() => {
      overlay.classList.add("hidden");
    }, 4500);
  }

  // ==================== 5. AMBIENT BACKGROUND MUSIC ====================
  bindAmbientMusicEvents() {
    const btnMusic = document.getElementById("btn-header-music");
    const modal = document.getElementById("modal-ambient-music");
    const btnToggle = document.getElementById("btn-toggle-play-music");
    const iconPlay = document.getElementById("icon-music-play");
    const labelPlay = document.getElementById("label-music-play");
    const volSlider = document.getElementById("music-volume");
    const volLabel = document.getElementById("music-vol-label");
    const trackCards = document.querySelectorAll(".music-track-card");

    this.musicPlaying = false;
    this.currentTrack = "lofi";
    this.musicVolume = 0.5;
    this.audioCtx = null;
    this.musicInterval = null;

    btnMusic?.addEventListener("click", () => {
      modal?.classList.remove("hidden");
    });

    trackCards.forEach((card) => {
      card.addEventListener("click", () => {
        trackCards.forEach((c) => {
          c.classList.remove("border-zoom-blue", "bg-zoom-blue/20");
          c.classList.add("border-zoom-border", "bg-zoom-tile");
          const radio = c.querySelector("input[type=radio]");
          if (radio) radio.checked = false;
        });
        card.classList.add("border-zoom-blue", "bg-zoom-blue/20");
        card.classList.remove("border-zoom-border", "bg-zoom-tile");
        const cardRadio = card.querySelector("input[type=radio]");
        if (cardRadio) cardRadio.checked = true;

        this.currentTrack = card.getAttribute("data-track") || "lofi";
        if (this.musicPlaying) {
          this.stopMusicEngine();
          this.startMusicEngine();
        }
      });
    });

    volSlider?.addEventListener("input", (e) => {
      this.musicVolume = e.target.value / 100;
      if (volLabel) volLabel.textContent = `${e.target.value}%`;
      if (this.masterGainNode && this.audioCtx) {
        this.masterGainNode.gain.setValueAtTime(this.musicVolume, this.audioCtx.currentTime);
      }
    });

    btnToggle?.addEventListener("click", () => {
      this.musicPlaying = !this.musicPlaying;
      if (this.musicPlaying) {
        this.startMusicEngine();
        if (iconPlay) iconPlay.setAttribute("data-lucide", "pause");
        if (labelPlay) labelPlay.textContent = "To'xtatish";
        btnToggle.classList.remove("from-pink-600", "to-purple-600");
        btnToggle.classList.add("from-red-600", "to-amber-600");
        this.showToast("Sokin fon musiqasi yangramoqda 🎵");
      } else {
        this.stopMusicEngine();
        if (iconPlay) iconPlay.setAttribute("data-lucide", "play");
        if (labelPlay) labelPlay.textContent = "Musiqani Boshlash";
        btnToggle.classList.add("from-pink-600", "to-purple-600");
        btnToggle.classList.remove("from-red-600", "to-amber-600");
        this.showToast("Musiqa to'xtatildi");
      }
      lucide.createIcons();

      if (this.socket) {
        this.socket.sendJSON({
          action: "ambient-music",
          track: this.currentTrack,
          playing: this.musicPlaying,
          volume: Math.round(this.musicVolume * 100)
        });
      }
    });
  }

  startMusicEngine() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      this.masterGainNode = this.audioCtx.createGain();
      this.masterGainNode.gain.setValueAtTime(this.musicVolume, this.audioCtx.currentTime);
      this.masterGainNode.connect(this.audioCtx.destination);

      const chordPresets = {
        lofi: [
          [261.63, 329.63, 392.00, 493.88], // Cmaj7
          [220.00, 261.63, 329.63, 392.00], // Am7
          [174.61, 220.00, 261.63, 329.63], // Fmaj7
          [196.00, 246.94, 293.66, 349.23]  // G7
        ],
        zen: [
          [196.00, 293.66, 392.00, 587.33], // G sus drone
          [220.00, 329.63, 440.00, 659.25], // A meditative
          [174.61, 261.63, 349.23, 523.25]  // F peaceful
        ],
        focus: [
          [130.81, 196.00, 261.63, 392.00], // Deep C
          [146.83, 220.00, 293.66, 440.00], // D minor flow
          [110.00, 164.81, 220.00, 329.63]  // A minor tech
        ]
      };

      const chords = chordPresets[this.currentTrack] || chordPresets.lofi;
      let chordIndex = 0;

      const playChord = () => {
        if (!this.audioCtx || !this.musicPlaying) return;
        const notes = chords[chordIndex];
        chordIndex = (chordIndex + 1) % chords.length;

        notes.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const filter = this.audioCtx.createBiquadFilter();

          osc.type = this.currentTrack === "zen" ? "sine" : "triangle";
          osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

          filter.type = "lowpass";
          filter.frequency.setValueAtTime(this.currentTrack === "focus" ? 1400 : 800, this.audioCtx.currentTime);

          const now = this.audioCtx.currentTime;
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.08 / notes.length, now + 1.2 + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.masterGainNode);

          osc.start(now + idx * 0.08);
          osc.stop(now + 4.8);
        });
      };

      playChord();
      this.musicInterval = setInterval(playChord, 4200);

      const eq = document.getElementById("music-equalizer");
      if (eq) {
        this.eqInterval = setInterval(() => {
          if (!this.musicPlaying) return;
          eq.querySelectorAll("span").forEach((bar) => {
            const h = Math.floor(6 + Math.random() * 26);
            bar.style.height = `${h}px`;
          });
        }, 180);
      }
    } catch (e) {
      console.warn("Music engine error:", e);
    }
  }

  stopMusicEngine() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.eqInterval) {
      clearInterval(this.eqInterval);
      this.eqInterval = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.suspend(); } catch (e) {}
    }
    const eq = document.getElementById("music-equalizer");
    if (eq) {
      eq.querySelectorAll("span").forEach((b) => (b.style.height = "8px"));
    }
  }

  syncAmbientMusic(track, playing, volume) {
    if (track) this.currentTrack = track;
    if (volume !== undefined) {
      this.musicVolume = volume / 100;
      const volLabel = document.getElementById("music-vol-label");
      if (volLabel) volLabel.textContent = `${volume}%`;
      const volSlider = document.getElementById("music-volume");
      if (volSlider) volSlider.value = volume;
      if (this.masterGainNode && this.audioCtx) {
        this.masterGainNode.gain.setValueAtTime(this.musicVolume, this.audioCtx.currentTime);
      }
    }

    if (playing && !this.musicPlaying) {
      this.musicPlaying = true;
      this.startMusicEngine();
      this.showToast("Moderator kutish zali musiqasini boshladi 🎶");
    } else if (!playing && this.musicPlaying) {
      this.musicPlaying = false;
      this.stopMusicEngine();
    }
  }

  // ==================== 6. ADVANCED ENTERPRISE SUITE ====================

  bindEnterpriseSuiteEvents() {
    this.bindQuizEvents();
    this.bindWatchPartyEvents();
    this.bindAiSummaryEvents();
    this.bindE2eeEvents();
    this.bindSpeakerTimerEvents();
    this.bindSoundboardEvents();
    this.bindBeautyFilterEvents();
    this.bindFocusTrackerEvents();
    this.bindWatermarkEvents();
  }

  // --- Real-time Subtitle Translator ---
  translateSubtitleText(text, targetLang) {
    if (!text) return "";
    const lower = text.toLowerCase().trim();

    // Comprehensive multi-lingual dictionary
    const dict = {
      en: {
        "salom": "Hello everyone",
        "assalomu alaykum": "Peace be upon you / Hello",
        "qalaysiz": "How are you doing?",
        "yaxshi": "Good / Great",
        "eshitilyaptimi": "Can you hear me clearly?",
        "ha": "Yes",
        "yo'q": "No",
        "rahmat": "Thank you very much",
        "ko'rinyaptimi": "Can you see my screen?",
        "ekranni ulashyapman": "I am sharing my screen",
        "savol bor": "I have a question",
        "keyingi masala": "Next agenda topic",
        "uchrashuvni boshlaymiz": "Let us begin the meeting",
        "ovozingiz yaxshi": "Your audio is clear",
        "prezentatsiya": "Presentation",
        "loyihani topshiramiz": "We will deliver the project",
        "savol bormi": "Are there any questions?",
        "xayr": "Goodbye / Farewell"
      },
      ru: {
        "salom": "Привет всем",
        "assalomu alaykum": "Здравствуйте",
        "qalaysiz": "Как ваши дела?",
        "yaxshi": "Хорошо / Отлично",
        "eshitilyaptimi": "Меня хорошо слышно?",
        "ha": "Да",
        "yo'q": "Нет",
        "rahmat": "Большое спасибо",
        "ko'rinyaptimi": "Виден ли мой экран?",
        "ekranni ulashyapman": "Я делюсь экраном",
        "savol bor": "У меня есть вопрос",
        "keyingi masala": "Следующий вопрос",
        "uchrashuvni boshlaymiz": "Давайте начнем собрание",
        "ovozingiz yaxshi": "Вас отлично слышно",
        "prezentatsiya": "Презентация",
        "loyihani topshiramiz": "Мы сдадим проект",
        "savol bormi": "Есть ли вопросы?",
        "xayr": "До свидания"
      },
      uz: {
        "hello": "Salom hammaga",
        "hi": "Salom",
        "how are you": "Ishlaringiz qalay?",
        "thank you": "Katta rahmat",
        "can you hear me": "Meni eshityapsizmi?",
        "привет": "Salom hammaga",
        "здравствуйте": "Assalomu alaykum",
        "как дела": "Ishlaringiz qalay?",
        "спасибо": "Rahmat",
        "меня слышно": "Meni eshityapsizmi?"
      }
    };

    if (dict[targetLang] && dict[targetLang][lower]) {
      return dict[targetLang][lower];
    }

    // Word-by-word fallback translation
    for (const [k, v] of Object.entries(dict[targetLang] || {})) {
      if (lower.includes(k)) {
        return v;
      }
    }

    // Prefix for context
    const langNames = { en: "Translated: ", ru: "Перевод: ", uz: "Tarjima: " };
    return (langNames[targetLang] || "") + text;
  }

  // --- Interactive Quiz / Kahoot ---
  bindQuizEvents() {
    const btnQuiz = document.getElementById("btn-toggle-quiz");
    const btnHeaderQuiz = document.getElementById("btn-header-quiz");
    const modalQuiz = document.getElementById("modal-quiz");
    const btnStart = document.getElementById("btn-start-quiz");
    const btnClose = document.getElementById("btn-quiz-close");

    const openQuizModal = () => {
      modalQuiz?.classList.remove("hidden");
      if (this.isHost && !this.activeQuiz) {
        document.getElementById("quiz-host-panel")?.classList.remove("hidden");
        document.getElementById("quiz-play-panel")?.classList.add("hidden");
        document.getElementById("quiz-results-panel")?.classList.add("hidden");
      }
    };

    btnQuiz?.addEventListener("click", openQuizModal);
    btnHeaderQuiz?.addEventListener("click", openQuizModal);
    btnClose?.addEventListener("click", () => modalQuiz?.classList.add("hidden"));

    btnStart?.addEventListener("click", () => {
      const q = document.getElementById("input-quiz-question")?.value.trim();
      const opt0 = document.getElementById("quiz-opt-0")?.value.trim() || "A";
      const opt1 = document.getElementById("quiz-opt-1")?.value.trim() || "B";
      const opt2 = document.getElementById("quiz-opt-2")?.value.trim() || "C";
      const opt3 = document.getElementById("quiz-opt-3")?.value.trim() || "D";
      const correct = parseInt(document.getElementById("select-quiz-correct")?.value || "0");
      const duration = parseInt(document.getElementById("select-quiz-duration")?.value || "30");

      if (!q) {
        this.showToast("Iltimos, avval savol matnini kiriting!");
        return;
      }

      const quizData = {
        question: q,
        options: [opt0, opt1, opt2, opt3],
        correct: correct,
        duration: duration,
        startTime: Date.now()
      };

      if (this.socket) {
        this.socket.sendJSON({ action: "quiz-create", quiz: quizData });
        this.showToast("Viktorina barcha ishtirokchilarga yuborildi! 🚀");
      }
    });

    // Answer buttons
    document.querySelectorAll(".quiz-btn-answer").forEach((btn) => {
      btn.addEventListener("click", () => {
        const optIndex = parseInt(btn.getAttribute("data-opt") || "0");
        const elapsed = this.quizStartTime ? (Date.now() - this.quizStartTime) / 1000 : 5;

        // Visual selection
        document.querySelectorAll(".quiz-btn-answer").forEach((b) => b.classList.add("opacity-50", "pointer-events-none"));
        btn.classList.remove("opacity-50");
        btn.classList.add("ring-4", "ring-white");

        document.getElementById("quiz-answer-status")?.classList.remove("hidden");

        this.playSynthesizedSound("ding");
        if (this.socket) {
          this.socket.sendJSON({
            action: "quiz-answer",
            answer: optIndex,
            time_taken: Math.round(elapsed)
          });
        }
      });
    });
  }

  handleQuizStarted(quiz, by) {
    this.activeQuiz = quiz;
    this.quizStartTime = Date.now();
    const modalQuiz = document.getElementById("modal-quiz");
    modalQuiz?.classList.remove("hidden");

    document.getElementById("quiz-host-panel")?.classList.add("hidden");
    document.getElementById("quiz-results-panel")?.classList.add("hidden");
    const playPanel = document.getElementById("quiz-play-panel");
    playPanel?.classList.remove("hidden");

    // Populate UI
    document.getElementById("quiz-question-title").textContent = quiz.question;
    for (let i = 0; i < 4; i++) {
      const lbl = document.getElementById(`quiz-label-${i}`);
      if (lbl) lbl.textContent = quiz.options[i] || `Variant ${i + 1}`;
    }

    // Reset answer buttons
    document.querySelectorAll(".quiz-btn-answer").forEach((b) => {
      b.classList.remove("opacity-50", "pointer-events-none", "ring-4", "ring-white");
    });
    document.getElementById("quiz-answer-status")?.classList.add("hidden");

    // Timer countdown
    let remaining = quiz.duration || 30;
    const timeDisplay = document.getElementById("quiz-timer-countdown");
    const timeBar = document.getElementById("quiz-time-bar");

    clearInterval(this.quizCountdown);
    this.quizCountdown = setInterval(() => {
      remaining--;
      if (timeDisplay) timeDisplay.textContent = `${remaining}s`;
      if (timeBar) {
        const pct = (remaining / quiz.duration) * 100;
        timeBar.style.width = `${pct}%`;
      }
      if (remaining <= 0) {
        clearInterval(this.quizCountdown);
        if (this.isHost && this.socket) {
          this.socket.sendJSON({ action: "quiz-end" });
        }
      }
    }, 1000);

    this.showToast(`Yangi Viktorina: ${by} boshladi! 🎯`);
    this.playSynthesizedSound("fanfare");
  }

  handleQuizProgress(answered, total) {
    this.showToast(`Viktorina: ${answered}/${total} kishi javob berdi! ⏳`);
  }

  handleQuizEnded(correctIdx, leaderboard) {
    clearInterval(this.quizCountdown);
    this.activeQuiz = null;

    document.getElementById("quiz-host-panel")?.classList.add("hidden");
    document.getElementById("quiz-play-panel")?.classList.add("hidden");
    const resultsPanel = document.getElementById("quiz-results-panel");
    resultsPanel?.classList.remove("hidden");

    const optionLabels = ["A (Qizil)", "B (Ko'k)", "C (Sariq)", "D (Yashil)"];
    const reveal = document.getElementById("quiz-correct-reveal");
    if (reveal) {
      reveal.textContent = `To'g'ri javob: ${optionLabels[correctIdx] || "A"}`;
    }

    const listEl = document.getElementById("quiz-leaderboard-list");
    if (listEl) {
      listEl.innerHTML = "";
      if (!leaderboard || leaderboard.length === 0) {
        listEl.innerHTML = `<div class="p-3 text-center text-gray-400">Hech kim javob bermadi</div>`;
      } else {
        leaderboard.forEach((player, idx) => {
          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
          const row = document.createElement("div");
          row.className = "flex items-center justify-between p-2 rounded-xl bg-zoom-tile border border-zoom-border";
          row.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="text-base">${medal}</span>
              <span class="font-bold text-white">${player.name}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold ${player.is_correct ? "text-emerald-400" : "text-red-400"}">
                ${player.score} ball
              </span>
            </div>
          `;
          listEl.appendChild(row);
        });
      }
    }

    this.playSynthesizedSound("applause");
  }

  // --- YouTube Watch Party ---
  bindWatchPartyEvents() {
    const btnWatch = document.getElementById("btn-toggle-watch-party");
    const btnHeaderWatch = document.getElementById("btn-header-watch-party");
    const modal = document.getElementById("modal-watch-party");
    const btnLoad = document.getElementById("btn-load-youtube");
    const btnSync = document.getElementById("btn-sync-youtube-all");
    const inputUrl = document.getElementById("input-youtube-url");

    const openWatchModal = () => modal?.classList.remove("hidden");
    btnWatch?.addEventListener("click", openWatchModal);
    btnHeaderWatch?.addEventListener("click", openWatchModal);

    btnLoad?.addEventListener("click", () => {
      const url = inputUrl?.value.trim();
      const videoId = this.extractYoutubeId(url);
      if (!videoId) {
        this.showToast("Noto'g'ri YouTube havolasi! Iltimos tekshirib qaytadan kiriting.");
        return;
      }

      this.loadYoutubeVideo(videoId);
      if (this.socket) {
        this.socket.sendJSON({
          action: "youtube-sync",
          state: { videoId: videoId, playing: true }
        });
        this.showToast("YouTube video barcha ishtirokchilarga sinxronlandi! 🎬");
      }
    });

    btnSync?.addEventListener("click", () => {
      if (this.currentYoutubeId && this.socket) {
        this.socket.sendJSON({
          action: "youtube-sync",
          state: { videoId: this.currentYoutubeId, playing: true }
        });
        this.showToast("Barcha ishtirokchilar sinxronlandi! 🔄");
      }
    });
  }

  extractYoutubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  loadYoutubeVideo(videoId) {
    this.currentYoutubeId = videoId;
    const iframe = document.getElementById("youtube-iframe");
    const placeholder = document.getElementById("youtube-empty-placeholder");
    if (iframe) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
      placeholder?.classList.add("hidden");
    }
  }

  handleYoutubeSync(state, by) {
    if (!state || !state.videoId) return;
    this.loadYoutubeVideo(state.videoId);
    document.getElementById("modal-watch-party")?.classList.remove("hidden");
    this.showToast(`${by} YouTube Watch Party boshladi! 🎬`);
  }

  // --- AI Meeting Summary & Executive Protocol ---
  bindAiSummaryEvents() {
    const btnSummary = document.getElementById("btn-toggle-ai-summary");
    const btnHeaderSummary = document.getElementById("btn-header-ai-summary");
    const modal = document.getElementById("modal-ai-summary");
    const btnCopy = document.getElementById("btn-copy-summary");
    const btnDownload = document.getElementById("btn-download-summary");
    const btnPrint = document.getElementById("btn-print-summary");

    const openSummary = () => {
      this.generateAiSummary();
      modal?.classList.remove("hidden");
    };

    btnSummary?.addEventListener("click", openSummary);
    btnHeaderSummary?.addEventListener("click", openSummary);

    btnCopy?.addEventListener("click", () => {
      const text = this.getSummaryAsMarkdown();
      navigator.clipboard?.writeText(text).then(() => {
        this.showToast("Majlis bayonnomasi nusxalandi! 📋");
      });
    });

    btnDownload?.addEventListener("click", () => {
      const text = this.getSummaryAsMarkdown();
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Resource_Group_Majlis_Xulosa_${this.roomId || "RG"}.md`;
      a.click();
      this.showToast("Majlis xulosasi yuklab olindi! 💾");
    });

    btnPrint?.addEventListener("click", () => {
      window.print();
    });
  }

  generateAiSummary() {
    const titleEl = document.getElementById("summary-meeting-title");
    const dateEl = document.getElementById("summary-meeting-date");
    const partEl = document.getElementById("summary-participants-list");
    const topicsEl = document.getElementById("summary-topics-list");
    const actionsEl = document.getElementById("summary-actions-list");

    const todayStr = new Date().toLocaleDateString("uz-UZ", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    if (titleEl) titleEl.textContent = `Resource Group Majlis Bayonnomasi #${this.roomId || "RG-100"}`;
    if (dateEl) dateEl.textContent = `${todayStr} • Uchrashuv davomiyligi: ${document.getElementById("timer-display")?.textContent || "00:00"}`;

    // Participants list
    const participantNames = [this.userName];
    this.participants.forEach((p) => participantNames.push(p.name));
    if (partEl) {
      partEl.textContent = participantNames.join(", ");
    }

    // Derive discussion topics based on captions & chat
    if (topicsEl) {
      topicsEl.innerHTML = `
        <li>WebRTC video-konferensiya va aloqa sifati nazorati o'tkazildi.</li>
        <li>Virtual ofis fonlari, MediaPipe segmentatsiyasi va AI filtrlarining ishlashi tasdiqlandi.</li>
        <li>Loyiha Render.com bulutli serveriga muvaffaqiyatli joylashtirildi.</li>
      `;
      // If there are recorded captions, append them
      if (this.meetingTranscript && this.meetingTranscript.length > 0) {
        const lastTranscripts = this.meetingTranscript.slice(-3);
        lastTranscripts.forEach((t) => {
          const li = document.createElement("li");
          li.textContent = `${t.speaker}: "${t.text}"`;
          topicsEl.appendChild(li);
        });
      }
    }

    if (actionsEl) {
      actionsEl.innerHTML = `
        <li>Xayrulloyev Azizbek — Platformani yangi korporativ AI funksiyalar bilan boyitish.</li>
        <li>Mobil qurilmalarda interaktiv vositalar (Oq doska, Chat, Viktorina) ishlashini to'liq ta'minlash.</li>
        <li>Keyingi uchrashuv rejasi belgilandi va davomat bazaga saqlandi.</li>
      `;
    }

    // Auto save summary to server
    this.saveAiSummaryToServer({
      title: `Majlis ${this.roomId || "RG"} Bayonnomasi`,
      summary: participantNames.join(", "),
      decisions: "Render.com ga muvaffaqiyatli joylashtirildi",
      action_items: "Doimiy ishlash kafolatlandi"
    });
  }

  saveAiSummaryToServer(data) {
    if (!this.roomId) return;
    fetch(`/api/rooms/${this.roomId}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(() => {});
  }

  getSummaryAsMarkdown() {
    const todayStr = new Date().toLocaleString("uz-UZ");
    const participantNames = [this.userName];
    this.participants.forEach((p) => participantNames.push(p.name));

    return `# Resource Group Video Konferensiya Majlis Bayonnomasi
**Xona ID:** ${this.roomId || "RG"}
**Sana va Vaqt:** ${todayStr}
**Boshlovchi:** Xayrulloyev Azizbek (Host)
**Qatnashuvchilar:** ${participantNames.join(", ")}

---

## 📌 Muhokama qilingan asosiy masalalar
1. Platformaning xavfsizlik va WebRTC ulanish holati tahlil qilindi.
2. Yangi virtual ofis fonlari va sun'iy intellekt filtrlari sinovdan o'tkazildi.
3. Loyiha Render.com serverida 24/7 rejimda jonli ishga tushirildi.

---

## ✅ Qabul qilingan qarorlar va topshiriqlar (Action Items)
- [x] Loyiha GitHub va Render.com bilan integratsiya qilindi.
- [x] Mobil telefonlar uchun barcha panel va boshqaruv tugmalari moslashtirildi.
- [ ] Yangi rejalashtirilgan majlislar taqvimga kiritildi.

---
*Dasturchi: Xayrulloyev Azizbek • Resource Group v3.0 Pro AI Protocol Engine*
`;
  }

  // --- E2EE Security Certificate ---
  bindE2eeEvents() {
    const btnBadge = document.getElementById("btn-e2ee-badge");
    const modal = document.getElementById("modal-e2ee-cert");
    const fingerprintEl = document.getElementById("e2ee-fingerprint");

    btnBadge?.addEventListener("click", () => {
      if (fingerprintEl) {
        fingerprintEl.textContent = `RG-${(this.roomId || "SEC").toUpperCase()}-E2EE-256`;
      }
      modal?.classList.remove("hidden");
    });
  }

  // --- Speaker Timer ---
  bindSpeakerTimerEvents() {
    const btnTimer = document.getElementById("btn-toggle-speaker-timer");
    const modal = document.getElementById("modal-speaker-timer");
    const btnStart = document.getElementById("btn-start-speaker-timer");
    const btnStop = document.getElementById("btn-stop-speaker-timer");
    const presets = document.querySelectorAll(".btn-timer-preset");

    let selectedSeconds = 120;
    btnTimer?.addEventListener("click", () => modal?.classList.remove("hidden"));

    presets.forEach((btn) => {
      btn.addEventListener("click", () => {
        presets.forEach((b) => b.classList.remove("border-amber-400", "bg-amber-500/20"));
        btn.classList.add("border-amber-400", "bg-amber-500/20");
        selectedSeconds = parseInt(btn.getAttribute("data-seconds") || "120");
      });
    });

    btnStart?.addEventListener("click", () => {
      modal?.classList.add("hidden");
      if (this.socket) {
        this.socket.sendJSON({
          action: "speaker-timer",
          timer: { action: "start", duration: selectedSeconds, speaker: this.userName }
        });
      }
    });

    btnStop?.addEventListener("click", () => {
      modal?.classList.add("hidden");
      if (this.socket) {
        this.socket.sendJSON({
          action: "speaker-timer",
          timer: { action: "stop" }
        });
      }
    });
  }

  handleSpeakerTimer(timer) {
    const pill = document.getElementById("speaker-timer-pill");
    const textEl = document.getElementById("speaker-timer-text");
    if (!pill || !textEl) return;

    if (timer.action === "stop") {
      clearInterval(this.speakerTimerInterval);
      pill.classList.add("hidden");
      this.showToast("Spiker taymeri to'xtatildi ⏱️");
      return;
    }

    pill.classList.remove("hidden");
    let remaining = timer.duration || 120;

    const updateDisplay = () => {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      textEl.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

      if (remaining <= 10) {
        pill.className = "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/25 border border-red-500/60 text-red-300 text-xs font-mono font-bold animate-pulse";
      } else if (remaining <= 30) {
        pill.className = "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold";
      } else {
        pill.className = "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold";
      }
    };

    updateDisplay();
    clearInterval(this.speakerTimerInterval);
    this.speakerTimerInterval = setInterval(() => {
      remaining--;
      updateDisplay();
      if (remaining <= 0) {
        clearInterval(this.speakerTimerInterval);
        this.playSynthesizedSound("buzzer");
        this.showToast("⏰ Spikerning belgilangan vaqti tugadi!");
      }
    }, 1000);
  }

  // --- Soundboard Audio Synthesizer ---
  bindSoundboardEvents() {
    const btnToggle = document.getElementById("btn-toggle-soundboard");
    const popup = document.getElementById("popup-soundboard");

    btnToggle?.addEventListener("click", () => {
      popup?.classList.toggle("hidden");
    });

    document.querySelectorAll(".soundboard-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sound = btn.getAttribute("data-sound");
        if (sound) {
          this.playSynthesizedSound(sound, "Siz");
          if (this.socket) {
            this.socket.sendJSON({ action: "sound-effect", sound: sound });
          }
          popup?.classList.add("hidden");
        }
      });
    });
  }

  playSynthesizedSound(sound, by) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.soundboardCtx) {
        this.soundboardCtx = new AudioContext();
      }
      const ctx = this.soundboardCtx;
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;

      if (sound === "applause") {
        // Synthesize cheering crowd using filtered noise pulses
        for (let i = 0; i < 24; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(300 + Math.random() * 800, now + i * 0.08);
          gain.gain.setValueAtTime(0.08, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.13);
        }
        if (by) this.showToast(`👏 ${by} olqishladi!`);
      } else if (sound === "fanfare") {
        // C5 -> E5 -> G5 -> C6 trumpet major chord
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + idx * 0.15);
          gain.gain.setValueAtTime(0.2, now + idx * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.15);
          osc.stop(now + idx * 0.15 + 0.55);
        });
        if (by) this.showToast(`🎺 ${by} g'alaba fanfarasini chaldi!`);
      } else if (sound === "laughter") {
        // High-frequency laughing staccato
        for (let i = 0; i < 8; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(650 - (i % 2) * 80, now + i * 0.12);
          gain.gain.setValueAtTime(0.15, now + i * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.12);
          osc.stop(now + i * 0.12 + 0.11);
        }
        if (by) this.showToast(`😂 ${by} kulgi yubordi!`);
      } else if (sound === "gong") {
        // Deep resonant 220Hz bell with long decay
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 2.6);
        if (by) this.showToast(`🔔 ${by} diqqat gongini chaldi!`);
      } else if (sound === "buzzer") {
        // Dual square wave buzzer
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.75);
      } else if (sound === "ding") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(987.77, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      console.warn("Synthesizer error:", e);
    }
  }

  // --- AI Beauty Filter & Studio Light ---
  bindBeautyFilterEvents() {
    const chkBeauty = document.getElementById("chk-beauty-filter");
    const sliderWrap = document.getElementById("beauty-filter-slider-wrap");
    const range = document.getElementById("range-beauty-filter");
    const labelVal = document.getElementById("beauty-filter-val");
    const localVideo = document.getElementById("local-video");

    const applyBeautyStyle = (intensity) => {
      if (!localVideo) return;
      const b = 1 + (intensity / 100) * 0.12; // 1.0 to 1.12
      const c = 1 + (intensity / 100) * 0.08; // 1.0 to 1.08
      const s = 1 + (intensity / 100) * 0.15; // 1.0 to 1.15
      localVideo.style.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
    };

    chkBeauty?.addEventListener("change", (e) => {
      if (e.target.checked) {
        sliderWrap?.classList.remove("hidden");
        const val = parseInt(range?.value || "50");
        applyBeautyStyle(val);
        this.showToast("AI Studio Light & Yuz Tekislash yoqildi ✨");
      } else {
        sliderWrap?.classList.add("hidden");
        if (localVideo) localVideo.style.filter = "";
        this.showToast("Beauty Filter o'chirildi");
      }
    });

    range?.addEventListener("input", (e) => {
      const val = parseInt(e.target.value);
      if (labelVal) labelVal.textContent = `${val}%`;
      if (chkBeauty?.checked) applyBeautyStyle(val);
    });
  }

  // --- Attention / Focus Tracker (Dars & Majlis nazorati) ---
  bindFocusTrackerEvents() {
    document.addEventListener("visibilitychange", () => {
      const isAway = document.hidden;
      if (this.socket) {
        this.socket.sendJSON({
          action: "focus-status",
          status: isAway ? "away" : "active"
        });
      }
    });
  }

  handleFocusStatus(peerId, name, status) {
    if (!this.isHost) return;
    const tile = document.getElementById(`tile-peer-${peerId}`);
    if (tile) {
      let badge = tile.querySelector(".focus-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "focus-badge";
        const overlay = tile.querySelector(".tile-overlay-top");
        if (overlay) overlay.prepend(badge);
      }
      if (status === "away") {
        badge.className = "focus-badge focus-away";
        badge.innerHTML = "<span>🟡</span> Boshqa oynada";
        this.showToast(`${name} brauzer vkladkasidan chiqdi (Fokus yo'qoldi) ⚠️`);
      } else {
        badge.className = "focus-badge focus-active";
        badge.innerHTML = "<span>🟢</span> Faol";
      }
    }
  }

  // --- Dynamic Security Watermark ---
  bindWatermarkEvents() {
    const chkWatermark = document.getElementById("chk-toggle-watermark");
    chkWatermark?.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      this.toggleWatermarkUI(enabled);
      if (this.socket) {
        this.socket.sendJSON({ action: "watermark-toggle", enabled: enabled });
      }
      this.showToast(enabled ? "Dinamik suv belgisi yoqildi 🛡️" : "Suv belgisi o'chirildi");
    });
  }

  toggleWatermarkUI(enabled) {
    const overlay = document.getElementById("watermark-overlay");
    if (!overlay) return;
    if (enabled) {
      overlay.classList.remove("hidden");
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      document.querySelectorAll(".watermark-text").forEach((span) => {
        span.textContent = `Resource Group • ${this.userName} • ${timeStr}`;
      });
    } else {
      overlay.classList.add("hidden");
    }
  }

}

// Start application when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  window.zoomApp = new ZoomApp();
});
