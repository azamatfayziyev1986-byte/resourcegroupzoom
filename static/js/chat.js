// Chat & Interaction Manager
class ChatManager {
  constructor(socketManager) {
    this.socket = socketManager;
    this.messagesContainer = document.getElementById("chat-messages");
    this.chatForm = document.getElementById("chat-form");
    this.chatInput = document.getElementById("chat-input");
    this.targetSelect = document.getElementById("chat-target-select");
    this.fileInput = document.getElementById("chat-file-input");
    this.btnFile = document.getElementById("btn-chat-file");
    this.unreadBadge = document.getElementById("badge-unread-chat");
    this.unreadCount = 0;
    this.isChatOpen = false;

    this.initEvents();
  }

  initEvents() {
    if (this.chatForm) {
      this.chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = this.chatInput.value.trim();
        if (!text) return;

        const target = this.targetSelect ? this.targetSelect.value : "everyone";
        const isPrivate = target !== "everyone";

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        this.socket.send({
          action: "chat",
          text: text,
          timestamp: timeStr,
          is_private: isPrivate,
          target_id: isPrivate ? target : null
        });

        this.chatInput.value = "";
      });
    }

    // File / Image upload button
    if (this.btnFile && this.fileInput) {
      this.btnFile.addEventListener("click", () => {
        this.fileInput.click();
      });

      this.fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset input so same file can be re-selected if needed
        e.target.value = "";

        const origIcon = this.btnFile.innerHTML;
        this.btnFile.innerHTML = '<span class="text-[10px] animate-spin">⏳</span>';
        this.btnFile.disabled = true;

        try {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData
          });
          const data = await res.json();

          if (data && data.url) {
            const target = this.targetSelect ? this.targetSelect.value : "everyone";
            const isPrivate = target !== "everyone";
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            this.socket.send({
              action: "chat",
              text: `[Fayl]: ${data.name}`,
              timestamp: timeStr,
              is_private: isPrivate,
              target_id: isPrivate ? target : null,
              file_url: data.url,
              file_name: data.name,
              file_size: data.size,
              file_type: data.type
            });
          }
        } catch (err) {
          console.error("Fayl yuklashda xatolik:", err);
          alert("Fayl yuklashda xatolik yuz berdi!");
        } finally {
          this.btnFile.innerHTML = origIcon;
          this.btnFile.disabled = false;
          lucide.createIcons();
        }
      });
    }

    // Voice Note Recording
    this.btnVoice = document.getElementById("btn-chat-voice-record");
    this.voiceRecorder = null;
    this.voiceChunks = [];
    this.isRecordingVoice = false;

    if (this.btnVoice) {
      this.btnVoice.addEventListener("click", () => this.toggleVoiceRecording());
    }

    // Pinned message unpin
    document.getElementById("btn-unpin-chat")?.addEventListener("click", () => {
      document.getElementById("pinned-chat-container")?.classList.add("hidden");
      this.socket.send({ action: "chat-unpin" });
    });

    // Reaction emojis
    document.querySelectorAll(".emoji-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = btn.innerText;
        this.socket.send({ action: "reaction", emoji: emoji });
        this.showFloatingReaction(emoji, "Siz");
        document.getElementById("reactions-popover")?.classList.add("hidden");
      });
    });
  }

  async toggleVoiceRecording() {
    if (this.isRecordingVoice) {
      if (this.voiceRecorder && this.voiceRecorder.state === "recording") {
        this.voiceRecorder.stop();
      }
      this.isRecordingVoice = false;
      this.btnVoice.classList.remove("text-red-500", "animate-pulse");
      this.btnVoice.innerHTML = '<i data-lucide="mic" class="w-4 h-4"></i>';
      lucide.createIcons();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.voiceChunks = [];
      this.voiceRecorder = new MediaRecorder(stream);
      
      this.voiceRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.voiceChunks.push(e.data);
      };

      this.voiceRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.voiceChunks, { type: "audio/webm" });
        if (blob.size < 500) return; // Too short

        try {
          const formData = new FormData();
          formData.append("file", blob, `voice-${Date.now()}.webm`);
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (data && data.url) {
            const target = this.targetSelect ? this.targetSelect.value : "everyone";
            const isPrivate = target !== "everyone";
            const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            this.socket.send({
              action: "chat",
              text: "[Ovozli xabar]",
              timestamp: timeStr,
              is_private: isPrivate,
              target_id: isPrivate ? target : null,
              file_url: data.url,
              file_name: "Ovozli xabar",
              is_voice: true
            });
          }
        } catch (e) {
          console.error("Voice upload error:", e);
        }
      };

      this.voiceRecorder.start();
      this.isRecordingVoice = true;
      this.btnVoice.classList.add("text-red-500", "animate-pulse");
      this.btnVoice.innerHTML = '<i data-lucide="square" class="w-4 h-4"></i>';
      lucide.createIcons();
    } catch (err) {
      console.warn("Mic access denied for voice note:", err);
      alert("Ovozli xabar yozish uchun mikrofon ruxsati berilmadi!");
    }
  }

  addMessage(msg, isLocal = false) {
    if (!this.messagesContainer) return;

    const div = document.createElement("div");
    div.className = `flex flex-col text-xs rounded-lg p-2.5 max-w-[85%] ${
      isLocal
        ? "ml-auto bg-zoom-blue text-white"
        : msg.is_private
        ? "mr-auto bg-purple-900/60 border border-purple-500/40 text-purple-200"
        : "mr-auto bg-zoom-tile border border-zoom-border text-gray-200"
    }`;

    const senderHeader = document.createElement("div");
    senderHeader.className = "flex items-center justify-between gap-3 text-[10px] text-gray-300/80 mb-1 font-semibold";
    
    let label = isLocal ? "Siz" : msg.sender_name;
    if (msg.is_private) {
      label += " (Shaxsiy)";
    }
    senderHeader.innerHTML = `<span>${label}</span><span>${msg.timestamp || ""}</span>`;
    div.appendChild(senderHeader);

    // Text content
    if (msg.text && (!msg.file_url || !msg.text.startsWith("[Fayl]:"))) {
      const body = document.createElement("div");
      body.className = "break-words leading-relaxed";
      body.textContent = msg.text;
      div.appendChild(body);
    }

    // Voice Message Rendering
    if (msg.is_voice && msg.file_url) {
      const voiceCard = document.createElement("div");
      voiceCard.className = "flex items-center gap-2 p-2 mt-1.5 rounded-xl bg-black/40 border border-white/20";
      voiceCard.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs">
          🎤
        </div>
        <audio controls src="${msg.file_url}" class="h-7 max-w-[200px]"></audio>
      `;
      div.appendChild(voiceCard);
    }

    // File / Image Attachment Rendering
    if (msg.file_url && !msg.is_voice) {
      const isImg = (msg.file_type && msg.file_type.startsWith("image/")) || 
                    /\.(png|jpe?g|gif|webp|svg)$/i.test(msg.file_url);

      if (isImg) {
        const imgLink = document.createElement("a");
        imgLink.href = msg.file_url;
        imgLink.target = "_blank";
        imgLink.className = "block mt-1.5 rounded-lg overflow-hidden border border-white/20 hover:opacity-95 transition-opacity";
        imgLink.innerHTML = `<img src="${msg.file_url}" class="max-h-52 max-w-full rounded-lg object-contain bg-black/40" alt="${msg.file_name || 'Rasm'}" loading="lazy">`;
        div.appendChild(imgLink);
      } else {
        const fileCard = document.createElement("a");
        fileCard.href = msg.file_url;
        fileCard.download = msg.file_name || "fayl";
        fileCard.target = "_blank";
        fileCard.className = "flex items-center gap-2 p-2 mt-1.5 rounded-lg bg-black/30 border border-white/20 hover:bg-black/50 transition-colors text-white cursor-pointer group";
        fileCard.innerHTML = `
          <div class="w-8 h-8 rounded-lg bg-zoom-blue/30 text-zoom-blue flex items-center justify-center flex-shrink-0 text-sm font-bold">
            📁
          </div>
          <div class="flex-1 min-w-0 text-left">
            <div class="text-[11px] font-bold truncate group-hover:underline">${msg.file_name || "Hujjat"}</div>
            <div class="text-[9px] text-gray-300">${msg.file_size || ""} • Yuklab olish ⬇️</div>
          </div>
        `;
        div.appendChild(fileCard);
      }
    }

    // Pin and Reaction actions
    const actionsRow = document.createElement("div");
    actionsRow.className = "flex items-center gap-2 mt-1.5 pt-1 border-t border-white/10 text-[10px] text-gray-300/80";
    actionsRow.innerHTML = `
      <button class="hover:text-amber-400 cursor-pointer flex items-center gap-1" title="Xabarni qadash">📌 Qadash</button>
      <div class="flex items-center gap-1.5 ml-auto">
        <button class="hover:scale-125 transition-transform cursor-pointer" data-r="👍">👍</button>
        <button class="hover:scale-125 transition-transform cursor-pointer" data-r="❤️">❤️</button>
        <button class="hover:scale-125 transition-transform cursor-pointer" data-r="👏">👏</button>
      </div>
    `;
    actionsRow.querySelector("button").addEventListener("click", () => {
      this.socket.send({ action: "chat-pin", text: msg.text || msg.file_name, sender: label });
      const pinContainer = document.getElementById("pinned-chat-container");
      const pinText = document.getElementById("pinned-chat-text");
      if (pinContainer && pinText) {
        pinContainer.classList.remove("hidden");
        pinText.textContent = `${label}: ${msg.text || msg.file_name}`;
      }
    });
    actionsRow.querySelectorAll("[data-r]").forEach(rBtn => {
      rBtn.addEventListener("click", () => {
        const r = rBtn.getAttribute("data-r");
        this.socket.send({ action: "chat-reaction", emoji: r, msg_id: msg.timestamp });
        rBtn.textContent = `${r} 1`;
      });
    });
    div.appendChild(actionsRow);

    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    if (!this.isChatOpen && !isLocal) {
      this.unreadCount++;
      if (this.unreadBadge) {
        this.unreadBadge.textContent = this.unreadCount;
        this.unreadBadge.classList.remove("hidden");
      }
    }
  }

  markAsRead() {
    this.unreadCount = 0;
    if (this.unreadBadge) {
      this.unreadBadge.classList.add("hidden");
    }
  }

  showFloatingReaction(emoji, senderName = "") {
    const container = document.getElementById("reactions-container");
    if (!container) return;

    const el = document.createElement("div");
    el.className = "floating-reaction";
    const randomOffset = (Math.random() - 0.5) * 160;
    el.style.marginLeft = `${randomOffset}px`;
    el.innerHTML = `<span>${emoji}</span>`;

    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 2500);
  }
}
