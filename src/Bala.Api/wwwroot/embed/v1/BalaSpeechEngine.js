import { BalaUtils } from "./BalaUtils.js";

export class BalaSpeechEngine {
  constructor({ logger, onBoundary, onStateChange, onError } = {}) {
    this.logger = logger;
    this.onBoundary = onBoundary;
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.state = "idle";
    this.rate = 1.0;
    this.voiceQuery = undefined;
    this.language = undefined;
    this.chunks = [];
    this.chunkBaseTokenIndex = [];
    this.chunkIndex = 0;
    this.speechAvailable = "speechSynthesis" in window;
  }

  setOptions({ rate, voiceQuery, language } = {}) {
    if (typeof rate === "number") this.rate = rate;
    if (voiceQuery !== undefined) this.voiceQuery = voiceQuery || undefined;
    if (language !== undefined) this.language = language || undefined;
  }

  setContent({ title, text, language }) {
    const cleanText = (text || "").trim();
    const finalTitle = (title || "").trim();
    const normalizedTitle = finalTitle.replace(/\s+/g, " ").toLowerCase();
    const normalizedBodyStart = cleanText
      .slice(0, Math.min(cleanText.length, 300))
      .replace(/\s+/g, " ")
      .toLowerCase();
    const includesTitle =
      normalizedTitle && normalizedBodyStart.includes(normalizedTitle);
    const combined =
      finalTitle && !includesTitle
        ? `${finalTitle}.\n\n${cleanText}`
        : cleanText;

    this.chunks = this.chunkText(combined, 1500, 2000);
    this.chunkIndex = 0;
    this.chunkBaseTokenIndex = [];
    let running = 0;
    for (const chunk of this.chunks) {
      this.chunkBaseTokenIndex.push(running);
      running += BalaUtils.countTokens(chunk);
    }
    this.language = language || this.language;
    this.transitionState("idle");
  }

  play() {
    if (!this.speechAvailable) {
      this.transitionState("error");
      this.onError?.(new Error("Speech synthesis not supported"));
      return;
    }

    if (!this.chunks.length) {
      this.transitionState("error");
      this.onError?.(new Error("No speech content"));
      return;
    }

    window.speechSynthesis.cancel();
    this.chunkIndex = 0;
    this.transitionState("playing");
    this.speakNext();
  }

  pause() {
    if (!this.speechAvailable) return;
    window.speechSynthesis.pause();
    this.transitionState("paused");
  }

  resume() {
    if (!this.speechAvailable) return;
    window.speechSynthesis.resume();
    this.transitionState("playing");
  }

  stop() {
    if (!this.speechAvailable) return;
    window.speechSynthesis.cancel();
    this.transitionState("stopped");
  }

  selectVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!this.voiceQuery) return undefined;
    return voices.find((voice) =>
      voice.name.toLowerCase().includes(this.voiceQuery.toLowerCase()),
    );
  }

  speakNext() {
    if (this.chunkIndex >= this.chunks.length) {
      this.transitionState("ended");
      return;
    }

    const chunk = this.chunks[this.chunkIndex];
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = this.rate;
    utterance.lang = this.language || undefined;
    const voice = this.selectVoice();
    if (voice) utterance.voice = voice;

    utterance.onboundary = (event) => {
      if (event.name !== "word") return;
      const charIndex = Number.isFinite(event.charIndex) ? event.charIndex : 0;
      const chunkBaseTokenIndex =
        this.chunkBaseTokenIndex[this.chunkIndex] || 0;
      this.onBoundary?.({
        chunkText: chunk,
        charIndex,
        chunkIndex: this.chunkIndex,
        chunkBaseTokenIndex,
      });
    };

    utterance.onend = () => {
      this.chunkIndex += 1;
      this.speakNext();
    };

    utterance.onerror = () => {
      this.transitionState("error");
      this.onError?.(new Error("Speech synthesis error"));
    };

    window.speechSynthesis.speak(utterance);
  }

  chunkText(text, minSize, maxSize) {
    const chunks = [];
    let cursor = 0;
    while (cursor < text.length) {
      let end = Math.min(cursor + maxSize, text.length);
      if (end < text.length) {
        const sentenceEnd = this.findSentenceEnd(text, cursor + minSize, end);
        if (sentenceEnd > cursor + minSize) {
          end = sentenceEnd;
        } else {
          const whitespace = text.lastIndexOf(" ", end);
          if (whitespace > cursor + minSize) end = whitespace;
        }
      }
      const part = text.slice(cursor, end).trim();
      if (part) chunks.push(part);
      cursor = end;
    }
    return chunks;
  }

  findSentenceEnd(text, start, end) {
    const slice = text.slice(start, end);
    const match = slice.match(/([.!?])(?=\s|$)(?!.*[.!?])/);
    if (!match) return -1;
    return start + match.index + 1;
  }

  transitionState(state) {
    this.state = state;
    this.onStateChange?.(state);
  }
}
