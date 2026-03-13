import { BalaUtils } from "./BalaUtils.js";

const DEFAULT_EXCLUSION_SELECTORS = [
  ".ad-banner",
  ".ad-small",
  ".advertisement",
  ".sponsored",
  ".promo",
  "[data-ad]",
  "[aria-label*=advert i]",
];

const BLOCKED_TAGS = [
  "script",
  "style",
  "noscript",
  "button",
  "input",
  "textarea",
];

export class BalaTracker {
  constructor({ highlight, logger, throttleMs = 50 } = {}) {
    this.highlight = highlight;
    this.logger = logger;
    this.throttleMs = throttleMs;
    this.tokenMap = [];
    this.tokenText = "";
    this.globalTokenIndex = 0;
    this.lastHighlightAt = 0;
    this.highlightWindowStart = 0;
    this.highlightWindowCount = 0;
    this.observer = null;
    this.root = null;
    this.exclusionSet = new Set();
    this.isPlaying = false;
    this.dirty = false;
    this.rebuildTimer = null;
  }

  prepare({ root, exclusionSelectors = DEFAULT_EXCLUSION_SELECTORS }) {
    this.root = root;
    this.exclusionSet = this.collectExclusions(root, exclusionSelectors);
    this.tokenMap = this.buildTokenMap(this.collectTextNodes(root));
    this.tokenText = this.buildTokenText(this.tokenMap);
    this.globalTokenIndex = 0;
    this.dirty = false;
    this.logger?.debug("token map size", this.tokenMap.length);
    this.attachObserver();
  }

  reset() {
    this.globalTokenIndex = 0;
  }

  getTokenText() {
    return this.tokenText;
  }

  setPlaying(isPlaying) {
    this.isPlaying = isPlaying;
  }

  refreshIfDirty() {
    if (!this.dirty || !this.root) return;
    this.prepare({ root: this.root });
  }

  handleBoundary({ chunkText, charIndex, chunkBaseTokenIndex }) {
    if (!this.tokenMap.length) return;
    const safeIndex = Math.max(0, Math.min(charIndex, chunkText.length));
    const chunkTokenIndex = BalaUtils.countTokens(
      chunkText.slice(0, safeIndex),
    );
    const nextIndex = chunkBaseTokenIndex + chunkTokenIndex;
    this.highlightTokenByIndex(nextIndex);
  }

  highlightTokenByIndex(nextIndex) {
    if (!Number.isFinite(nextIndex)) return;
    if (!this.tokenMap.length) return;
    if (nextIndex < this.globalTokenIndex) return;

    const now = BalaUtils.nowMs();
    if (now - this.lastHighlightAt < this.throttleMs) return;
    this.lastHighlightAt = now;

    const bounded = Math.min(nextIndex, this.tokenMap.length - 1);
    const token = this.tokenMap[bounded];
    if (!token?.node?.isConnected) return;

    try {
      const range = document.createRange();
      range.setStart(token.node, token.start);
      range.setEnd(token.node, token.end);
      this.highlight.highlightRange(range);
      this.globalTokenIndex = bounded;
      this.recordHighlightTick();
    } catch {
      // Ignore invalid ranges.
    }
  }

  clearHighlight() {
    this.highlight.clear();
  }

  destroy() {
    this.clearHighlight();
    this.disconnectObserver();
    this.tokenMap = [];
    this.tokenText = "";
    this.root = null;
    this.exclusionSet = new Set();
  }

  collectTextNodes(root) {
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("bala-reader")) return NodeFilter.FILTER_REJECT;
        if (this.isInExclusionSet(parent)) return NodeFilter.FILTER_REJECT;
        if (BLOCKED_TAGS.includes(parent.tagName.toLowerCase())) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  buildTokenMap(textNodes) {
    const map = [];
    const tokenRegex = /[\p{L}\p{N}']+/gu;
    for (const node of textNodes) {
      const text = node.textContent || "";
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

  buildTokenText(tokenMap) {
    return tokenMap.map((token) => token.tokenRaw).join(" ");
  }

  collectExclusions(root, selectors) {
    const set = new Set();
    if (!root) return set;
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

  isInExclusionSet(element) {
    let current = element;
    while (current) {
      if (this.exclusionSet.has(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  attachObserver() {
    this.disconnectObserver();
    if (!this.root || !window.MutationObserver) return;

    this.observer = new MutationObserver(() => {
      this.dirty = true;
      if (!this.isPlaying) {
        this.scheduleRebuild();
      }
    });

    this.observer.observe(this.root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  disconnectObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.rebuildTimer) {
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
  }

  scheduleRebuild() {
    if (this.rebuildTimer) return;
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      if (!this.isPlaying && this.dirty) {
        this.refreshIfDirty();
      }
    }, 1200);
  }

  recordHighlightTick() {
    const now = BalaUtils.nowMs();
    if (!this.highlightWindowStart) {
      this.highlightWindowStart = now;
    }

    this.highlightWindowCount += 1;
    const elapsed = now - this.highlightWindowStart;
    if (elapsed >= 1000) {
      this.logger?.debug(
        "highlight updates/sec (approx)",
        Number((this.highlightWindowCount / (elapsed / 1000)).toFixed(1)),
      );
      this.highlightWindowStart = now;
      this.highlightWindowCount = 0;
    }
  }
}
