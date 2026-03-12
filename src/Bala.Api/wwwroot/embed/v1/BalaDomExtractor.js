import { BalaUtils } from "./BalaUtils.js";

const CANDIDATE_SELECTORS = [
  "article",
  "main",
  "[role=main]",
  ".content",
  ".article",
  ".post",
  ".entry-content",
];

const REMOVE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  ".sidebar",
  ".share",
  ".comment",
  ".related",
  ".recommended",
  ".ad",
  ".sponsor",
  ".banner",
  ".promo",
];

const TEXT_BLOCK_SELECTORS = ["p", "h1", "h2", "h3", "blockquote", "li"];

const BANNED_TEXT = ["advertisement", "sponsored", "promo"];

export class BalaDomExtractor {
  constructor({ logger }) {
    this.logger = logger;
  }

  extractFromDocument() {
    const candidates = this.findCandidates();
    const best = this.pickBestCandidate(candidates) || document.body;
    return this.extractFromRoot(best);
  }

  extractFromRoot(root) {
    if (!root) {
      return { title: "", cleanText: "", blocks: [] };
    }

    const clone = root.cloneNode(true);
    this.removeNoise(clone);
    const title = this.resolveTitle(clone);
    const blocks = this.collectBlocks(clone);
    return {
      title,
      blocks,
      cleanText: blocks.join("\n\n").trim(),
    };
  }

  findCandidates() {
    const seen = new Set();
    const nodes = [];
    for (const selector of CANDIDATE_SELECTORS) {
      document.querySelectorAll(selector).forEach((node) => {
        if (!seen.has(node)) {
          seen.add(node);
          nodes.push(node);
        }
      });
    }
    return nodes;
  }

  pickBestCandidate(nodes) {
    let best = null;
    let bestScore = -Infinity;
    for (const node of nodes) {
      const score = this.scoreNode(node);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  scoreNode(node) {
    if (!node) return -Infinity;
    const text = BalaUtils.normalizeWhitespace(node.textContent || "");
    if (!text || text.length < 200) return -Infinity;

    const paragraphCount = node.querySelectorAll("p").length;
    const headingCount = node.querySelectorAll("h1,h2,h3").length;
    const linkTextLength = Array.from(node.querySelectorAll("a"))
      .map((el) => (el.textContent || "").length)
      .reduce((sum, len) => sum + len, 0);
    const linkDensity = linkTextLength / Math.max(1, text.length);

    let score = 0;
    score += text.length / 100;
    score += paragraphCount * 3;
    score += headingCount * 2;
    score -= linkDensity * 50;

    if (node.tagName?.toLowerCase() === "article") {
      score += 15;
    }

    return score;
  }

  removeNoise(root) {
    root
      .querySelectorAll(REMOVE_SELECTORS.join(","))
      .forEach((node) => node.remove());
    root.querySelectorAll("*").forEach((node) => {
      const text = BalaUtils.normalizeWhitespace(
        node.textContent || "",
      ).toLowerCase();
      if (BANNED_TEXT.some((value) => text === value)) {
        node.remove();
      }
    });
  }

  resolveTitle(root) {
    const title =
      BalaUtils.normalizeWhitespace(root.querySelector("h1")?.textContent) ||
      BalaUtils.normalizeWhitespace(
        document.querySelector("h1")?.textContent,
      ) ||
      BalaUtils.normalizeWhitespace(document.title);
    return title || "";
  }

  collectBlocks(root) {
    const blocks = [];
    root.querySelectorAll(TEXT_BLOCK_SELECTORS.join(",")).forEach((node) => {
      const text = BalaUtils.normalizeWhitespace(node.textContent || "");
      if (BalaUtils.countWords(text) >= 3) {
        blocks.push(text);
      }
    });
    return blocks;
  }
}
