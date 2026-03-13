import { BalaUtils } from "./BalaUtils.js";
import { BalaApiClient } from "./BalaApiClient.js";
import { BalaDomExtractor } from "./BalaDomExtractor.js";
import { BalaHighlight } from "./BalaHighlight.js";
import { BalaTracker } from "./BalaTracker.js";
import { BalaSpeechEngine } from "./BalaSpeechEngine.js";

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
  static defaultApiBase = window.location.origin;

  static configureDefaults({ defaultApiBase }) {
    if (defaultApiBase) {
      BalaReader.defaultApiBase = defaultApiBase;
    }
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.sessionId = crypto?.randomUUID?.() || String(Date.now());
    this.article = null;
    this.loading = false;
    this.state = "idle";
    this.metrics = { highlightUpdates: 0, tokenCount: 0, chunkCount: 0 };
    this.setupConfig();

    this.logger = BalaUtils.createLogger(this.showDebug);
    this.apiClient = new BalaApiClient({
      apiBase: this.apiBase,
      logger: this.logger,
    });
    this.domExtractor = new BalaDomExtractor({ logger: this.logger });
    this.highlight = new BalaHighlight();
    this.tracker = new BalaTracker({
      highlight: this.highlight,
      logger: this.logger,
    });
    this.speech = new BalaSpeechEngine({
      logger: this.logger,
      onBoundary: (info) => this.handleBoundary(info),
      onStateChange: (state) => this.handleSpeechState(state),
      onError: (error) => this.handleSpeechError(error),
    });

    this.build();
  }

  connectedCallback() {
    this.highlight.ensureStyle();
    this.prepareTracking();
    this.logger.debug("embed initialized", {
      apiBase: this.apiBase,
      url: this.url,
      speechAvailable: this.speech.speechAvailable,
    });

    if (!this.speech.speechAvailable) {
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
    this.speech.stop();
    this.tracker.destroy();
  }

  setupConfig() {
    this.rate = parseFloat(this.getAttribute("rate") || "1.0");
    this.voiceQuery = this.getAttribute("voice") || undefined;
    this.lang = this.getAttribute("lang") || undefined;
    this.theme = this.getAttribute("theme") || "light";
    this.refresh = this.getAttribute("refresh") === "true";
    this.apiBase = this.getAttribute("api-base") || BalaReader.defaultApiBase;
    this.url = this.getAttribute("url") || window.location.href;
    this.position = this.getAttribute("position") || "inline";
    this.source = (this.getAttribute("source") || "api").toLowerCase();
    this.trackEnabled = this.getAttribute("track") === "true";
    this.showDebug = this.getAttribute("show-debug") === "true";
  }

  build() {
    const container = document.createElement("div");
    container.className = this.theme === "dark" ? "dark" : "";

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

    this.playBtn = this.makeButton("Play", () =>
      this.safeAction(() => this.handlePlay()),
    );
    this.pauseBtn = this.makeButton("Pause", () =>
      this.safeAction(() => this.handlePause()),
    );
    this.resumeBtn = this.makeButton("Resume", () =>
      this.safeAction(() => this.handleResume()),
    );
    this.stopBtn = this.makeButton("Stop", () =>
      this.safeAction(() => this.handleStop()),
    );
    this.trackBtn = this.makeButton("Track: Off", () =>
      this.safeAction(() => this.toggleTrack()),
    );
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
      this.speech.setOptions({ rate: this.rate });
      this.setStatus(`Rate: ${this.rate.toFixed(1)}x`);
    });

    this.voiceSelect = document.createElement("select");
    this.voiceSelect.className = "bala-select";
    this.voiceSelect.add(new Option("Auto voice", ""));
    this.voiceSelect.addEventListener("change", () => {
      this.voiceQuery = this.voiceSelect.value || undefined;
      this.speech.setOptions({ voiceQuery: this.voiceQuery });
      if (this.state === "playing") {
        this.handleStop();
        this.handlePlay();
      }
    });

    this.statusEl = document.createElement("div");
    this.statusEl.className = "bala-meta";
    this.statusEl.textContent = "";

    frame.append(header, controls, slider, this.voiceSelect, this.statusEl);
    container.append(style, frame);
    this.shadowRoot.appendChild(container);
    this.renderTrackState();
    this.loadVoices();
  }

  makeButton(label, handler) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
  }

  safeAction(action) {
    try {
      const result = action();
      if (result instanceof Promise) {
        result.catch((error) => this.handleUiError(error));
      }
    } catch (error) {
      this.handleUiError(error);
    }
  }

  handleUiError(error) {
    this.logger.error("widget error", error);
    this.setStatus("Unexpected error. Please retry.");
  }

  async loadVoices() {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const populate = () => {
      const voices = synth.getVoices();
      this.voiceSelect.innerHTML = "";
      this.voiceSelect.add(new Option("Auto voice", ""));
      voices.forEach((voice) => {
        const label = `${voice.name} (${voice.lang})`;
        this.voiceSelect.add(new Option(label, voice.name));
      });
      if (this.voiceQuery) this.voiceSelect.value = this.voiceQuery;
    };

    populate();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = populate;
    }
  }

  async ensureArticleLoaded() {
    if (this.article || this.loading) return;
    this.loading = true;
    this.toggleControls(true);
    this.setStatus("Fetching article...");

    const response = await this.apiClient.getArticleByUrl(
      this.url,
      this.refresh,
    );
    if (!response.ok) {
      this.logger.warn("fetch failed", response.error);
      if (this.source === "dom" || this.trackEnabled) {
        const fallback = this.domExtractor.extractFromDocument();
        if (fallback.cleanText) {
          this.article = {
            articleId: null,
            title: fallback.title || "Untitled",
            cleanText: fallback.cleanText,
            wordCount: BalaUtils.countWords(fallback.cleanText),
            estimatedMinutes: Math.max(
              1,
              Math.round(
                (BalaUtils.countWords(fallback.cleanText) / 180) * 10,
              ) / 10,
            ),
            language: null,
          };
          this.setStatus("Using on-page text");
        } else {
          this.setStatus(response.error?.message || "Failed to load article");
        }
      } else {
        this.setStatus(response.error?.message || "Failed to load article");
      }
      this.loading = false;
      this.toggleControls(false);
      return;
    }

    this.article = response.data;
    this.applyPreferredSpeechSource();
    this.titleEl.textContent = this.article.title || "Untitled";
    this.setStatus(
      `${this.article.wordCount} words · ~${this.article.estimatedMinutes} min`,
    );
    this.loading = false;
    this.toggleControls(false);
  }

  applyPreferredSpeechSource() {
    if (!this.article) return;

    const shouldUseDomSource = this.trackEnabled || this.source === "dom";
    if (!shouldUseDomSource) return;

    const domContent = this.domExtractor.extractFromDocument();
    if (!domContent.cleanText) return;

    this.article.cleanText = domContent.cleanText;
    if (domContent.title) this.article.title = domContent.title;
    const words = BalaUtils.countWords(domContent.cleanText);
    this.article.wordCount = words;
    this.article.estimatedMinutes = Math.max(
      1,
      Math.round((words / 180) * 10) / 10,
    );
  }

  handlePlay() {
    if (!this.speech.speechAvailable) {
      this.setStatus("Speech synthesis not supported in this browser.");
      return;
    }

    this.ensureArticleLoaded().then(() => {
      if (!this.article) return;
      this.prepareTracking();
      this.tracker.refreshIfDirty();
      this.tracker.reset();
      this.speech.setOptions({
        rate: this.rate,
        voiceQuery: this.voiceQuery,
        language: this.lang,
      });
      const trackerText = this.trackEnabled ? this.tracker.getTokenText() : "";
      const speechText = trackerText || this.article.cleanText || "";
      const speechTitle = this.trackEnabled ? "" : this.resolveSpeechTitle();

      this.speech.setContent({
        title: speechTitle,
        text: speechText,
        language: this.article.language || this.lang,
      });
      this.metrics.chunkCount = this.speech.chunks.length;
      this.metrics.tokenCount = this.tracker.tokenMap.length;
      this.logger.debug("metrics", this.metrics);
      if (this.trackEnabled && this.tracker.tokenMap.length) {
        this.tracker.highlightTokenByIndex(0);
      }
      this.speech.play();
      this.sendEvent("play", 0);
    });
  }

  handlePause() {
    this.speech.pause();
    this.sendEvent("pause", this.currentPosition());
    this.setStatus("Paused");
  }

  handleResume() {
    this.speech.resume();
    this.sendEvent("resume", this.currentPosition());
    this.setStatus("Resumed");
  }

  handleStop() {
    this.speech.stop();
    this.tracker.clearHighlight();
    this.sendEvent("stop", 0);
    this.setStatus("Stopped");
  }

  handleBoundary(info) {
    if (!this.trackEnabled) return;
    this.tracker.setPlaying(true);
    this.tracker.handleBoundary(info);
  }

  handleSpeechState(state) {
    this.state = state;
    this.tracker.setPlaying(state === "playing");
    if (state === "ended") {
      this.sendEvent("ended", this.currentPosition());
      this.tracker.clearHighlight();
      this.setStatus("Finished");
    } else if (state === "playing") {
      this.setStatus(
        `Playing chunk ${this.speech.chunkIndex + 1}/${this.speech.chunks.length}`,
      );
    }
  }

  handleSpeechError(error) {
    this.logger.warn("speech error", error);
    this.tracker.clearHighlight();
    this.setStatus("Error during playback");
  }

  prepareTracking() {
    if (!this.trackEnabled) return;
    const root = this.resolveTrackingRoot();
    if (!root) {
      this.logger.debug("tracking root not found");
      return;
    }
    this.tracker.prepare({ root });
  }

  resolveTrackingRoot() {
    const customSelector = this.getAttribute("content-selector");
    if (customSelector) {
      try {
        const customRoot = document.querySelector(customSelector);
        if (customRoot) return customRoot;
      } catch {
        // Ignore invalid selector and continue fallback chain.
      }
    }

    return (
      document.querySelector(".article-content") ||
      document.querySelector("article") ||
      document.querySelector("main") ||
      null
    );
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

  currentPosition() {
    if (!this.article || !this.speech.chunks.length) return 0;
    const charsSpoken = this.speech.chunks
      .slice(0, this.speech.chunkIndex)
      .reduce((acc, chunk) => acc + chunk.length, 0);
    const words = Math.max(1, Math.round(charsSpoken / 5));
    return Math.round(words / 2);
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
      this.tracker.clearHighlight();
    } else {
      this.prepareTracking();
    }
  }

  renderTrackState() {
    if (!this.trackBtn) return;
    this.trackBtn.textContent = this.trackEnabled ? "Track: On" : "Track: Off";
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }

  async sendEvent(eventType, positionSeconds) {
    if (!this.article?.articleId) return;
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
    await this.apiClient.postListenEvent(payload);
  }
}

export function registerBalaReader({ defaultApiBase } = {}) {
  if (!customElements.get("bala-reader")) {
    BalaReader.configureDefaults({ defaultApiBase });
    customElements.define("bala-reader", BalaReader);
  }
}
