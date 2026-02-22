(() => {
  const STYLE = `
    :host { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; display: inline-block; }
    .bala-frame { border: 1px solid #d0d7de; border-radius: 10px; padding: 12px; background: #ffffff; box-shadow: 0 6px 18px rgba(0,0,0,0.06); width: 320px; }
    .bala-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .bala-badge { background: #0f172a; color: #fff; font-weight: 600; padding: 4px 8px; border-radius: 8px; font-size: 12px; letter-spacing: 0.4px; }
    .bala-title { font-size: 15px; font-weight: 600; color: #0f172a; margin: 0; flex: 1; }
    .bala-controls { display: flex; gap: 6px; flex-wrap: wrap; }
    button { border: 1px solid #d0d7de; background: #f8fafc; color: #0f172a; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-weight: 600; flex: 1; min-width: 64px; }
    button:hover { background: #eef2ff; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .bala-meta { display: flex; justify-content: space-between; color: #475569; font-size: 12px; margin-top: 8px; }
    .bala-slider { width: 100%; }
    .bala-select { width: 100%; padding: 6px; border-radius: 8px; border: 1px solid #d0d7de; background: #fff; color: #0f172a; }
    .dark .bala-frame { background: #0f172a; color: #e2e8f0; border-color: #1e293b; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
    .dark button { background: #1e293b; color: #e2e8f0; border-color: #334155; }
    .dark button:hover { background: #334155; }
    .dark .bala-badge { background: #6366f1; }
    .dark .bala-title { color: #e2e8f0; }
    .dark .bala-meta { color: #cbd5e1; }
  `;

  class BalaReader extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.sessionId = crypto.randomUUID();
      this.article = null;
      this.loading = false;
      this.chunks = [];
      this.chunkIndex = 0;
      this.isSpeaking = false;
      this.rate = parseFloat(this.getAttribute("rate") || "1.0");
      this.voiceQuery = this.getAttribute("voice");
      this.lang = this.getAttribute("lang") || undefined;
      this.theme = this.getAttribute("theme") || "light";
      this.refresh = this.getAttribute("refresh") === "true";
      this.apiBase = this.getAttribute("api-base") || window.location.origin;
      this.url = this.getAttribute("url");
      this.position = this.getAttribute("position") || "inline";
      this.build();
    }

    connectedCallback() {
      if (!("speechSynthesis" in window)) {
        this.setStatus("Speech synthesis not supported in this browser.");
        return;
      }
      if (!this.url) {
        this.setStatus("Missing url attribute.");
        return;
      }
      this.setStatus("Ready. Click play to fetch.");
    }

    disconnectedCallback() {
      speechSynthesis.cancel();
    }

    build() {
      const container = document.createElement("div");
      container.className = `${this.theme === "dark" ? "dark" : ""}`;

      if (this.position === "bottom-right") {
        container.style.position = "fixed";
        container.style.bottom = "16px";
        container.style.right = "16px";
        container.style.zIndex = "2147483000";
      } else if (this.position === "bottom-left") {
        container.style.position = "fixed";
        container.style.bottom = "16px";
        container.style.left = "16px";
        container.style.zIndex = "2147483000";
      }

      const style = document.createElement("style");
      style.textContent = STYLE;

      const frame = document.createElement("div");
      frame.className = "bala-frame";

      const header = document.createElement("div");
      header.className = "bala-header";
      const badge = document.createElement("div");
      badge.className = "bala-badge";
      badge.textContent = "Bala Reader";
      this.titleEl = document.createElement("p");
      this.titleEl.className = "bala-title";
      this.titleEl.textContent = "Loading article...";
      header.appendChild(badge);
      header.appendChild(this.titleEl);

      const controls = document.createElement("div");
      controls.className = "bala-controls";

      this.playBtn = this.makeButton("Play", () => this.handlePlay());
      this.pauseBtn = this.makeButton("Pause", () => this.handlePause());
      this.resumeBtn = this.makeButton("Resume", () => this.handleResume());
      this.stopBtn = this.makeButton("Stop", () => this.handleStop());
      controls.append(
        this.playBtn,
        this.pauseBtn,
        this.resumeBtn,
        this.stopBtn,
      );

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0.5";
      slider.max = "1.5";
      slider.step = "0.1";
      slider.value = this.rate.toString();
      slider.className = "bala-slider";
      slider.addEventListener("input", () => {
        this.rate = parseFloat(slider.value);
        this.setStatus(`Rate: ${this.rate.toFixed(1)}x`);
      });

      this.voiceSelect = document.createElement("select");
      this.voiceSelect.className = "bala-select";
      this.voiceSelect.add(new Option("Auto voice", ""));
      this.voiceSelect.addEventListener("change", () => {
        this.voiceQuery = this.voiceSelect.value || undefined;
        if (this.isSpeaking) this.handleResume(true);
      });

      this.statusEl = document.createElement("div");
      this.statusEl.className = "bala-meta";
      this.statusEl.textContent = "";

      frame.append(header, controls, slider, this.voiceSelect, this.statusEl);
      container.append(style, frame);
      this.shadowRoot.appendChild(container);
    }

    makeButton(label, handler) {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.addEventListener("click", handler);
      return btn;
    }

    async ensureArticleLoaded() {
      if (this.article || this.loading) return;
      await this.fetchArticle();
    }

    async fetchArticle() {
      this.loading = true;
      this.toggleControls(true);
      this.setStatus("Fetching article...");
      try {
        const endpoint = `${this.apiBase}/v1/articles/by-url?url=${encodeURIComponent(this.url)}&refresh=${this.refresh}`;
        const resp = await fetch(endpoint);
        const payload = await resp.json();
        if (!payload.success)
          throw new Error(payload.error?.message || "Failed to load article");
        this.article = payload.data;
        this.titleEl.textContent = this.article.title || "Untitled";
        this.setStatus(
          `${this.article.wordCount} words · ~${this.article.estimatedMinutes} min`,
        );
        this.prepareChunks();
        await this.loadVoices();
      } catch (err) {
        this.setStatus(`Error: ${err.message}`);
      } finally {
        this.loading = false;
        this.toggleControls(false);
      }
    }

    prepareChunks() {
      if (!this.article) return;
      const text = this.article.cleanText;
      const max = 2800;
      const min = 1500;
      const parts = [];
      let cursor = 0;
      while (cursor < text.length) {
        let end = Math.min(cursor + max, text.length);
        if (end < text.length) {
          const lastSentence = text.lastIndexOf(".", end);
          if (lastSentence > cursor + min) end = lastSentence + 1;
        }
        parts.push(text.slice(cursor, end));
        cursor = end;
      }
      this.chunks = parts;
      this.chunkIndex = 0;
    }

    async loadVoices() {
      const populate = () => {
        const voices = speechSynthesis.getVoices();
        this.voiceSelect.innerHTML = "";
        this.voiceSelect.add(new Option("Auto voice", ""));
        voices.forEach((v) => {
          const label = `${v.name} (${v.lang})`;
          this.voiceSelect.add(new Option(label, v.name));
        });
        if (this.voiceQuery) this.voiceSelect.value = this.voiceQuery;
      };

      populate();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populate;
      }
    }

    selectVoice() {
      const voices = speechSynthesis.getVoices();
      if (!this.voiceQuery) return undefined;
      return voices.find((v) =>
        v.name.toLowerCase().includes(this.voiceQuery.toLowerCase()),
      );
    }

    async handlePlay() {
      if (this.loading) {
        this.setStatus("Still fetching...");
        return;
      }
      if (!this.article) {
        await this.fetchArticle();
        if (!this.article) return;
      }
      if (this.isSpeaking) {
        this.handleStop();
      }
      this.chunkIndex = 0;
      this.speakNext();
      this.sendEvent("play", 0);
    }

    handlePause() {
      speechSynthesis.pause();
      this.isSpeaking = false;
      this.sendEvent("pause", this.currentPosition());
      this.setStatus("Paused");
    }

    handleResume(force = false) {
      if (force && this.isSpeaking) {
        this.handleStop();
        this.speakNext();
        return;
      }
      speechSynthesis.resume();
      this.isSpeaking = true;
      this.sendEvent("resume", this.currentPosition());
      this.setStatus("Resumed");
    }

    handleStop() {
      speechSynthesis.cancel();
      this.isSpeaking = false;
      this.chunkIndex = 0;
      this.sendEvent("stop", 0);
      this.setStatus("Stopped");
    }

    speakNext() {
      if (!this.article || this.chunkIndex >= this.chunks.length) {
        this.isSpeaking = false;
        this.sendEvent("ended", this.currentPosition());
        this.setStatus("Finished");
        return;
      }
      const chunk = this.chunks[this.chunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = this.rate;
      utterance.lang = this.lang || this.article.language || undefined;
      const voice = this.selectVoice();
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        this.chunkIndex += 1;
        this.speakNext();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.sendEvent("stop", this.currentPosition());
        this.setStatus("Error during playback");
      };

      this.isSpeaking = true;
      speechSynthesis.speak(utterance);
      this.setStatus(
        `Playing chunk ${this.chunkIndex + 1}/${this.chunks.length}`,
      );
    }

    currentPosition() {
      if (!this.article || !this.chunks.length) return 0;
      const charsSpoken = this.chunks
        .slice(0, this.chunkIndex)
        .reduce((acc, c) => acc + c.length, 0);
      const words = Math.max(1, Math.round(charsSpoken / 5));
      return Math.round(words / 2); // rough seconds
    }

    setStatus(text) {
      this.statusEl.textContent = text;
    }

    toggleControls(disabled) {
      [
        this.playBtn,
        this.pauseBtn,
        this.resumeBtn,
        this.stopBtn,
        this.voiceSelect,
      ].forEach((el) => {
        el.disabled = disabled;
      });
    }

    async sendEvent(eventType, positionSeconds) {
      if (!this.article) return;
      const allowed = new Set(["play", "pause", "resume", "stop", "ended"]);
      if (!allowed.has(eventType)) return;
      const payload = {
        articleId: this.article.articleId,
        eventType,
        positionSeconds,
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        referrer: document.referrer || null,
        pageUrl: window.location.href,
      };
      try {
        await fetch(`${this.apiBase}/v1/events/listen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn("Bala analytics failed", err);
      }
    }
  }

  customElements.define("bala-reader", BalaReader);
})();
