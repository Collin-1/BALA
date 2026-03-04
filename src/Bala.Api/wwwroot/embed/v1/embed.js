(() => {
  const resolveEmbedScript = () =>
    document.currentScript ||
    Array.from(document.scripts)
      .reverse()
      .find(
        (script) =>
          script.src &&
          (script.src.endsWith("/embed/v1/embed.js") ||
            script.src.includes("/embed/v1/embed.js")),
      );

  const resolveDefaultApiBase = () => {
    const script = resolveEmbedScript();
    if (script?.src) {
      try {
        return new URL(script.src, window.location.href).origin;
      } catch {
        return window.location.origin;
      }
    }

    return window.location.origin;
  };

  const DEFAULT_API_BASE = resolveDefaultApiBase();

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
      this.apiBase = this.getAttribute("api-base") || DEFAULT_API_BASE;
      this.url = this.getAttribute("url") || window.location.href;
      this.position = this.getAttribute("position") || "inline";
      this.source = (this.getAttribute("source") || "api").toLowerCase();
      this.trackEnabled = this.getAttribute("track") === "true";
      this.showDebug = this.getAttribute("show-debug") === "true";
      this.pageTrackNodes = [];
      this.tokenMap = [];
      this.chunkBaseTokenIndex = [];
      this.globalTokenIndex = 0;
      this.trackingRootSelectorUsed = "none";
      this.excludedAdNodeCount = 0;
      this.pageTrackName = "bala-current-word";
      this.supportsCssHighlights =
        typeof window !== "undefined" &&
        typeof window.Highlight !== "undefined" &&
        !!window.CSS &&
        !!window.CSS.highlights;
      this.pageTrackActiveEl = null;
      this.hostWasPinned = false;
      this.lastBoundaryHighlightAt = 0;
      this.highlightWindowStart = 0;
      this.highlightWindowCount = 0;
      this.trackingRetryTimers = [];
      this.speechSynthesisAvailable = "speechSynthesis" in window;
      this.build();
    }

    connectedCallback() {
      if (this.showDebug) {
        console.log("Bala embed loaded");
        console.log("resolved apiBase", this.apiBase);
        console.log("resolved url", this.url);
        console.log("speechSynthesis available", this.speechSynthesisAvailable);
      }

      if (!this.speechSynthesisAvailable) {
        this.setStatus("Speech synthesis not supported in this browser.");
      }

      if (!this.url) {
        this.setStatus("Missing url attribute.");
      }

      if (this.speechSynthesisAvailable && this.url) {
        this.setStatus("Ready. Click play to fetch.");
      }

      this.preparePageTracking();
      if (!this.pageTrackNodes.length) {
        this.scheduleTrackingRetry();
      }
    }

    disconnectedCallback() {
      speechSynthesis.cancel();
      this.clearPageHighlight();
      this.clearTrackingRetry();
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
      this.trackBtn = this.makeButton("Track: Off", () => this.toggleTrack());
      controls.append(
        this.playBtn,
        this.pauseBtn,
        this.resumeBtn,
        this.stopBtn,
        this.trackBtn,
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
      this.renderTrackState();
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
        if (this.showDebug) {
          console.log("fetch endpoint", endpoint);
        }
        const resp = await fetch(endpoint);
        const payload = await resp.json();
        if (!payload.success)
          throw new Error(payload.error?.message || "Failed to load article");
        this.article = payload.data;
        this.applyPreferredSpeechSource();
        this.titleEl.textContent = this.article.title || "Untitled";
        this.setStatus(
          `${this.article.wordCount} words · ~${this.article.estimatedMinutes} min`,
        );
        this.prepareChunks();
        await this.loadVoices();
        if (this.showDebug) {
          console.log("fetch success", {
            articleId: this.article.articleId,
            wordCount: this.article.wordCount,
          });
        }
      } catch (err) {
        if (this.showDebug) {
          console.log("fetch failure", err);
        }
        this.setStatus(`Error: ${err.message}`);
      } finally {
        this.loading = false;
        this.toggleControls(false);
      }
    }

    applyPreferredSpeechSource() {
      if (!this.article) return;

      const shouldUseDomSource = this.trackEnabled || this.source === "dom";
      if (!shouldUseDomSource) return;

      const domContent = this.extractReadableFromPage();
      if (this.trackEnabled) {
        this.article.cleanText = domContent.cleanText || "";
        if (domContent.title) {
          this.article.title = domContent.title;
        }

        const words = this.countWords(this.article.cleanText);
        this.article.wordCount = words;
        this.article.estimatedMinutes = Math.max(
          1,
          Math.round((words / 180) * 10) / 10,
        );
        return;
      }

      if (!domContent.cleanText || domContent.cleanText.length < 120) return;

      this.article.cleanText = domContent.cleanText;
      if (domContent.title) {
        this.article.title = domContent.title;
      }

      const words = this.countWords(domContent.cleanText);
      this.article.wordCount = words;
      this.article.estimatedMinutes = Math.max(
        1,
        Math.round((words / 180) * 10) / 10,
      );
    }

    extractReadableFromPage() {
      const { root } = this.resolveTrackingRoot();
      if (!root) {
        return { title: "", cleanText: "" };
      }

      const clone = root.cloneNode(true);
      const exclusionSet = this.collectAdExclusionSet(clone);
      exclusionSet.forEach((el) => el.remove());
      clone
        .querySelectorAll(
          "script,style,noscript,iframe,nav,footer,header,aside,button,input,textarea",
        )
        .forEach((el) => el.remove());

      const title =
        (clone.querySelector("h1")?.textContent || "").trim() ||
        (document.querySelector("h1")?.textContent || "").trim() ||
        "";

      const blocks = Array.from(
        clone.querySelectorAll("h1,h2,h3,p,li,blockquote"),
      )
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const cleanText = blocks.join("\n\n").trim();
      return { title, cleanText };
    }

    countWords(text) {
      return (text.match(/\b\w+\b/g) || []).length;
    }

    countTokens(text) {
      return (text.match(/[\p{L}\p{N}']+/gu) || []).length;
    }

    prepareChunks() {
      if (!this.article) return;
      const title = this.resolveSpeechTitle();
      const body = (this.article.cleanText || "").trim();
      const normalizedTitle = title.replace(/\s+/g, " ").toLowerCase();
      const normalizedBodyStart = body
        .slice(0, Math.min(body.length, 300))
        .replace(/\s+/g, " ")
        .toLowerCase();
      const includesTitleAlready =
        normalizedTitle && normalizedBodyStart.includes(normalizedTitle);
      const text =
        title && !includesTitleAlready ? `${title}.\n\n${body}` : body;
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
      this.chunkBaseTokenIndex = [];
      let running = 0;
      for (const part of parts) {
        this.chunkBaseTokenIndex.push(running);
        running += this.countTokens(part);
      }
    }

    resolveSpeechTitle() {
      const fromArticle = (this.article?.title || "").trim();
      if (fromArticle) return fromArticle;

      try {
        const parsed = new URL(
          this.url || window.location.href,
          window.location.href,
        );
        const raw =
          parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
        const withoutExt = raw.replace(/\.[a-z0-9]+$/i, "");
        const normalized = withoutExt
          .replace(/[-_]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!normalized) return "Untitled article";
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      } catch {
        return "Untitled article";
      }
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

      if (!this.speechSynthesisAvailable) {
        this.setStatus("Speech synthesis not supported in this browser.");
        return;
      }

      if (!this.article) {
        await this.fetchArticle();
        if (!this.article) return;
      }
      if (this.isSpeaking) {
        this.handleStop();
      }

      this.preparePageTracking();
      this.globalTokenIndex = 0;
      if (!this.tokenMap.length) {
        this.scheduleTrackingRetry();
        await this.waitForTrackingNodes(1700);
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
      this.clearPageHighlight();
      this.sendEvent("stop", 0);
      this.setStatus("Stopped");
    }

    speakNext() {
      if (!this.article || this.chunkIndex >= this.chunks.length) {
        this.isSpeaking = false;
        this.sendEvent("ended", this.currentPosition());
        this.clearPageHighlight();
        this.setStatus("Finished");
        return;
      }
      const chunk = this.chunks[this.chunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = this.rate;
      utterance.lang = this.lang || this.article.language || undefined;
      const voice = this.selectVoice();
      if (voice) utterance.voice = voice;
      this.lastBoundaryHighlightAt = 0;
      this.highlightWindowStart =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.highlightWindowCount = 0;

      utterance.onboundary = (event) => {
        if (event.name !== "word") return;

        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - this.lastBoundaryHighlightAt < 50) return;
        this.lastBoundaryHighlightAt = now;

        const index = Number.isFinite(event.charIndex) ? event.charIndex : 0;
        const safeIndex = Math.max(0, Math.min(index, chunk.length));
        const chunkTokenIndex = this.countTokens(chunk.slice(0, safeIndex));
        const chunkBase = this.chunkBaseTokenIndex[this.chunkIndex] || 0;
        this.highlightTokenByIndex(chunkBase + chunkTokenIndex);
      };

      utterance.onend = () => {
        this.chunkIndex += 1;
        this.speakNext();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.clearPageHighlight();
        this.sendEvent("stop", this.currentPosition());
        this.setStatus("Error during playback");
      };

      this.isSpeaking = true;
      speechSynthesis.speak(utterance);
      this.highlightTokenByIndex(
        this.chunkBaseTokenIndex[this.chunkIndex] || 0,
      );
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
        this.trackBtn,
        this.voiceSelect,
      ].forEach((el) => {
        el.disabled = disabled;
      });
    }

    toggleTrack() {
      this.trackEnabled = !this.trackEnabled;
      this.renderTrackState();
      if (!this.trackEnabled) {
        this.clearPageHighlight();
      }
    }

    renderTrackState() {
      if (!this.trackBtn) return;
      this.trackBtn.textContent = this.trackEnabled
        ? "Track: On"
        : "Track: Off";
    }

    preparePageTracking() {
      this.ensurePageHighlightStyle();
      const { root, selectorUsed } = this.resolveTrackingRoot();
      this.trackingRootSelectorUsed = selectorUsed;
      if (!root) {
        this.pageTrackNodes = [];
        this.tokenMap = [];
        this.excludedAdNodeCount = 0;
        if (this.showDebug) {
          console.log(
            "chosen tracking root selector",
            this.trackingRootSelectorUsed,
          );
          console.log("ad nodes excluded count", this.excludedAdNodeCount);
          console.log(
            "preparePageTracking node count",
            this.pageTrackNodes.length,
          );
          console.log("token map size", this.tokenMap.length);
        }
        return;
      }

      const exclusionSet = this.collectAdExclusionSet(root);
      this.excludedAdNodeCount = exclusionSet.size;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest("bala-reader")) return NodeFilter.FILTER_REJECT;
          if (this.isInExclusionSet(parent, exclusionSet)) {
            return NodeFilter.FILTER_REJECT;
          }

          const tag = parent.tagName.toLowerCase();
          const blocked = [
            "script",
            "style",
            "noscript",
            "button",
            "input",
            "textarea",
          ];
          if (blocked.includes(tag)) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const nodes = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }

      this.pageTrackNodes = nodes;
      this.tokenMap = this.buildTokenMap(nodes);

      if (this.showDebug) {
        console.log(
          "chosen tracking root selector",
          this.trackingRootSelectorUsed,
        );
        console.log("ad nodes excluded count", this.excludedAdNodeCount);
        console.log(
          "preparePageTracking node count",
          this.pageTrackNodes.length,
        );
        console.log("token map size", this.tokenMap.length);
      }
    }

    resolveTrackingRoot() {
      const customSelector = this.getAttribute("content-selector");
      if (customSelector) {
        try {
          const customRoot = document.querySelector(customSelector);
          if (customRoot) {
            return { root: customRoot, selectorUsed: customSelector };
          }
        } catch {
          // Ignore invalid custom selector and continue fallback chain.
        }
      }

      const articleContentRoot = document.querySelector(".article-content");
      if (articleContentRoot) {
        return { root: articleContentRoot, selectorUsed: ".article-content" };
      }

      const articleRoot = document.querySelector("article");
      if (articleRoot) {
        return { root: articleRoot, selectorUsed: "article" };
      }

      const mainRoot = document.querySelector("main");
      if (mainRoot) {
        return { root: mainRoot, selectorUsed: "main" };
      }

      return { root: null, selectorUsed: "none" };
    }

    collectAdExclusionSet(root) {
      const set = new Set();
      const selectors = [
        ".ad-banner",
        ".ad-small",
        ".advertisement",
        ".sponsored",
        ".promo",
        "[data-ad]",
        "[aria-label*=advert i]",
      ];

      root.querySelectorAll(selectors.join(",")).forEach((el) => set.add(el));
      root.querySelectorAll("*").forEach((el) => {
        if (el.querySelector?.(".ad-label")) {
          set.add(el);
          return;
        }

        const text = (el.textContent || "").trim();
        if (text === "Advertisement" || text === "Sponsored") {
          set.add(el);
        }
      });

      return set;
    }

    isInExclusionSet(element, exclusionSet) {
      let current = element;
      while (current) {
        if (exclusionSet.has(current)) return true;
        current = current.parentElement;
      }
      return false;
    }

    buildTokenMap(textNodes) {
      const map = [];
      for (const node of textNodes) {
        const text = node.textContent || "";
        const tokenRegex = /[\p{L}\p{N}']+/gu;
        let match;
        while ((match = tokenRegex.exec(text)) !== null) {
          const raw = match[0];
          map.push({
            node,
            start: match.index,
            end: match.index + raw.length,
            tokenNormalized: raw.replace(/[\W_]+/g, "").toLowerCase(),
            tokenRaw: raw,
          });
        }
      }
      return map;
    }

    scheduleTrackingRetry() {
      this.clearTrackingRetry();
      [500, 1500].forEach((delay) => {
        const id = window.setTimeout(() => {
          this.preparePageTracking();
        }, delay);
        this.trackingRetryTimers.push(id);
      });
    }

    clearTrackingRetry() {
      this.trackingRetryTimers.forEach((id) => window.clearTimeout(id));
      this.trackingRetryTimers = [];
    }

    waitForTrackingNodes(timeoutMs) {
      if (this.tokenMap.length) {
        return Promise.resolve(true);
      }

      const start = Date.now();
      return new Promise((resolve) => {
        const tick = () => {
          if (this.tokenMap.length) {
            resolve(true);
            return;
          }

          if (Date.now() - start >= timeoutMs) {
            resolve(false);
            return;
          }

          window.setTimeout(tick, 100);
        };

        tick();
      });
    }

    ensurePageHighlightStyle() {
      if (document.getElementById("bala-page-highlight-style")) return;
      const style = document.createElement("style");
      style.id = "bala-page-highlight-style";
      style.textContent = `
        ::highlight(bala-current-word) {
          background: #fde68a;
          color: inherit;
          border-radius: 3px;
        }
        .bala-page-highlight {
          background: #fde68a !important;
          color: inherit !important;
          border-radius: 3px;
          padding: 0 2px;
        }
      `;
      document.head.appendChild(style);
    }

    highlightTokenByIndex(nextIndex) {
      if (!this.trackEnabled) return;
      if (!this.tokenMap.length) return;
      if (!Number.isFinite(nextIndex)) return;
      if (nextIndex < this.globalTokenIndex) return;

      const bounded = Math.min(nextIndex, this.tokenMap.length - 1);
      const token = this.tokenMap[bounded];
      if (!token || !token.node?.isConnected) return;

      try {
        const range = document.createRange();
        range.setStart(token.node, token.start);
        range.setEnd(token.node, token.end);

        this.clearPageHighlight();
        if (this.supportsCssHighlights) {
          const highlight = new Highlight(range);
          CSS.highlights.set(this.pageTrackName, highlight);
          this.pageTrackActiveEl = null;
        } else {
          const span = document.createElement("span");
          span.className = "bala-page-highlight";
          range.surroundContents(span);
          this.pageTrackActiveEl = span;
        }

        this.globalTokenIndex = bounded;
        this.recordHighlightTick();
      } catch {
        // Keep previous highlight if this token cannot be represented as a range.
      }
    }

    recordHighlightTick() {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!this.highlightWindowStart) {
        this.highlightWindowStart = now;
      }

      this.highlightWindowCount += 1;
      const elapsed = now - this.highlightWindowStart;
      if (elapsed >= 1000) {
        if (this.showDebug) {
          const updatesPerSecond = this.highlightWindowCount / (elapsed / 1000);
          console.log(
            "highlight updates/sec (approx)",
            Number(updatesPerSecond.toFixed(1)),
          );
        }
        this.highlightWindowStart = now;
        this.highlightWindowCount = 0;
      }
    }

    clearPageHighlight() {
      if (this.supportsCssHighlights) {
        CSS.highlights.delete(this.pageTrackName);
      }

      const el = this.pageTrackActiveEl;
      if (!el || !el.parentNode) {
        this.pageTrackActiveEl = null;
        return;
      }

      const textNode = document.createTextNode(el.textContent || "");
      const parent = el.parentNode;
      parent.replaceChild(textNode, el);
      if (parent.normalize) parent.normalize();
      this.pageTrackActiveEl = null;
    }

    setPinnedForReading(enabled) {
      this.hostWasPinned = enabled;
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
