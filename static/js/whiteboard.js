// Collaborative Interactive Whiteboard
class WhiteboardManager {
  constructor(socketManager) {
    this.socket = socketManager;
    this.canvas = document.getElementById("whiteboard-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.isDrawing = false;
    this.currentTool = "pen"; // "pen" | "eraser"
    this.currentColor = "#000000";
    this.lineWidth = 3;
    this.lastX = 0;
    this.lastY = 0;

    if (this.canvas) {
      this.initEvents();
      this.resizeCanvas();
      window.addEventListener("resize", () => this.resizeCanvas());
    }
  }

  resizeCanvas() {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      let tempImg = null;
      if (this.canvas.width > 0 && this.canvas.height > 0 && this.ctx) {
        try {
          tempImg = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } catch (e) {}
      }
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      if (this.ctx) {
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (tempImg && tempImg.width > 0 && tempImg.height > 0) {
          try {
            this.ctx.putImageData(tempImg, 0, 0);
          } catch (e) {}
        }
      }
    }
  }

  initEvents() {
    // Mouse events
    this.canvas.addEventListener("mousedown", (e) => this.startDraw(e.offsetX, e.offsetY));
    this.canvas.addEventListener("mousemove", (e) => this.draw(e.offsetX, e.offsetY));
    this.canvas.addEventListener("mouseup", () => this.stopDraw());
    this.canvas.addEventListener("mouseleave", () => this.stopDraw());

    // Touch events for Mobile & Tablet
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.startDraw(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.draw(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });

    this.canvas.addEventListener("touchend", () => this.stopDraw());

    // Controls
    const btnPen = document.getElementById("wb-tool-pen");
    const btnEraser = document.getElementById("wb-tool-eraser");
    const colorPicker = document.getElementById("wb-color-picker");
    const btnClear = document.getElementById("wb-btn-clear");
    const btnDownload = document.getElementById("wb-btn-download");
    const btnClose = document.getElementById("wb-btn-close");

    if (btnPen) {
      btnPen.addEventListener("click", () => {
        this.currentTool = "pen";
        this.lineWidth = 3;
        btnPen.classList.add("bg-blue-100", "text-zoom-blue");
        btnEraser.classList.remove("bg-blue-100", "text-zoom-blue");
      });
    }

    if (btnEraser) {
      btnEraser.addEventListener("click", () => {
        this.currentTool = "eraser";
        this.lineWidth = 20;
        btnEraser.classList.add("bg-blue-100", "text-zoom-blue");
        btnPen.classList.remove("bg-blue-100", "text-zoom-blue");
      });
    }

    if (colorPicker) {
      colorPicker.addEventListener("input", (e) => {
        this.currentColor = e.target.value;
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        this.clear();
        this.socket.send({ action: "whiteboard-clear" });
      });
    }

    if (btnDownload) {
      btnDownload.addEventListener("click", () => {
        const link = document.createElement("a");
        link.download = `zoom-whiteboard-${Date.now()}.png`;
        link.href = this.canvas.toDataURL();
        link.click();
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        document.getElementById("whiteboard-modal").classList.add("hidden");
      });
    }

    // Templates menu
    const btnTpl = document.getElementById("wb-btn-templates");
    const menuTpl = document.getElementById("wb-templates-menu");
    if (btnTpl && menuTpl) {
      btnTpl.addEventListener("click", (e) => {
        e.stopPropagation();
        menuTpl.classList.toggle("hidden");
      });
      document.addEventListener("click", () => menuTpl.classList.add("hidden"));

      document.querySelectorAll(".wb-tpl-item").forEach(item => {
        item.addEventListener("click", () => {
          const tpl = item.getAttribute("data-tpl");
          this.applyTemplate(tpl);
          menuTpl.classList.add("hidden");
          this.socket.send({ action: "whiteboard-template", template: tpl });
        });
      });
    }

    // Image upload & annotate
    const btnUploadImg = document.getElementById("wb-btn-upload-image");
    const fileInputImg = document.getElementById("wb-image-input");
    if (btnUploadImg && fileInputImg) {
      btnUploadImg.addEventListener("click", () => fileInputImg.click());
      fileInputImg.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            this.clear();
            const scale = Math.min(this.canvas.width / img.width, this.canvas.height / img.height);
            const x = (this.canvas.width - img.width * scale) / 2;
            const y = (this.canvas.height - img.height * scale) / 2;
            this.ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            this.socket.send({ action: "whiteboard-image", dataUrl: ev.target.result });
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      });
    }
  }

  applyTemplate(type) {
    if (!this.ctx || !this.canvas) return;
    this.clear();
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (type === "grid") {
      this.ctx.strokeStyle = "#e2e8f0";
      this.ctx.lineWidth = 1;
      const step = 25;
      for (let x = 0; x <= w; x += step) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, h);
        this.ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(w, y);
        this.ctx.stroke();
      }
    } else if (type === "ruled") {
      this.ctx.strokeStyle = "#cbd5e1";
      this.ctx.lineWidth = 1;
      const step = 32;
      for (let y = step; y < h; y += step) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(w, y);
        this.ctx.stroke();
      }
      // Red margin line
      this.ctx.strokeStyle = "#fca5a5";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(60, 0);
      this.ctx.lineTo(60, h);
      this.ctx.stroke();
    } else if (type === "kanban") {
      this.ctx.strokeStyle = "#94a3b8";
      this.ctx.lineWidth = 2;
      const colW = w / 3;
      // 2 vertical dividers
      this.ctx.beginPath();
      this.ctx.moveTo(colW, 0);
      this.ctx.lineTo(colW, h);
      this.ctx.moveTo(colW * 2, 0);
      this.ctx.lineTo(colW * 2, h);
      this.ctx.stroke();

      // Top title bar
      this.ctx.fillStyle = "#f1f5f9";
      this.ctx.fillRect(0, 0, w, 40);
      this.ctx.fillStyle = "#0f172a";
      this.ctx.font = "bold 14px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Qilinishi kerak (To Do)", colW / 2, 25);
      this.ctx.fillText("Jarayonda (In Progress)", colW * 1.5, 25);
      this.ctx.fillText("Bajarildi (Done)", colW * 2.5, 25);
    }
  }

  startDraw(x, y) {
    this.isDrawing = true;
    this.lastX = x;
    this.lastY = y;
  }

  draw(x, y) {
    if (!this.isDrawing) return;

    const stroke = {
      x0: this.lastX / this.canvas.width,
      y0: this.lastY / this.canvas.height,
      x1: x / this.canvas.width,
      y1: y / this.canvas.height,
      color: this.currentTool === "eraser" ? "#ffffff" : this.currentColor,
      size: this.lineWidth
    };

    this.renderStroke(stroke);
    this.socket.send({ action: "whiteboard-draw", stroke: stroke });

    this.lastX = x;
    this.lastY = y;
  }

  renderStroke(stroke) {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.size;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.moveTo(stroke.x0 * this.canvas.width, stroke.y0 * this.canvas.height);
    this.ctx.lineTo(stroke.x1 * this.canvas.width, stroke.y1 * this.canvas.height);
    this.ctx.stroke();
  }

  stopDraw() {
    this.isDrawing = false;
  }

  clear() {
    if (!this.ctx) return;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
