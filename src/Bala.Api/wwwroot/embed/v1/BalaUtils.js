export const BalaUtils = {
  resolveEmbedScript() {
    return (
      document.currentScript ||
      Array.from(document.scripts)
        .reverse()
        .find(
          (script) =>
            script.src &&
            (script.src.endsWith("/embed/v1/embed.js") ||
              script.src.includes("/embed/v1/embed.js")),
        )
    );
  },

  resolveDefaultApiBase(script) {
    if (script?.src) {
      try {
        return new URL(script.src, window.location.href).origin;
      } catch {
        return window.location.origin;
      }
    }

    return window.location.origin;
  },

  createLogger(showDebug) {
    return {
      debug: (...args) => {
        if (showDebug) {
          console.debug("[Bala]", ...args);
        }
      },
      info: (...args) => {
        console.info("[Bala]", ...args);
      },
      warn: (...args) => {
        console.warn("[Bala]", ...args);
      },
      error: (...args) => {
        console.error("[Bala]", ...args);
      },
    };
  },

  nowMs() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  normalizeWhitespace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  },

  countWords(text) {
    return (text.match(/\b\w+\b/g) || []).length;
  },

  countTokens(text) {
    return (text.match(/[\p{L}\p{N}']+/gu) || []).length;
  },

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  },
};
