export class BalaHighlight {
  constructor({
    highlightName = "bala-current-word",
    highlightClass = "bala-highlight",
  } = {}) {
    this.highlightName = highlightName;
    this.highlightClass = highlightClass;
    this.activeElement = null;
    this.supportsCssHighlights =
      typeof window !== "undefined" &&
      typeof window.Highlight !== "undefined" &&
      !!window.CSS &&
      !!window.CSS.highlights;
  }

  ensureStyle() {
    if (document.getElementById("bala-highlight-style")) return;
    const style = document.createElement("style");
    style.id = "bala-highlight-style";
    style.textContent = `
      ::highlight(${this.highlightName}) {
        background: #fde68a;
        color: inherit;
        border-radius: 3px;
      }
      .${this.highlightClass} {
        background: #fde68a !important;
        color: inherit !important;
        border-radius: 3px;
        padding: 0 2px;
      }
    `;
    document.head.appendChild(style);
  }

  highlightRange(range) {
    this.clear();
    if (this.supportsCssHighlights) {
      const highlight = new Highlight(range);
      CSS.highlights.set(this.highlightName, highlight);
      return;
    }

    const span = document.createElement("span");
    span.className = this.highlightClass;
    try {
      range.surroundContents(span);
      this.activeElement = span;
    } catch {
      this.activeElement = null;
    }
  }

  clear() {
    if (this.supportsCssHighlights) {
      CSS.highlights.delete(this.highlightName);
    }

    const el = this.activeElement;
    if (!el || !el.parentNode) {
      this.activeElement = null;
      return;
    }

    const textNode = document.createTextNode(el.textContent || "");
    const parent = el.parentNode;
    parent.replaceChild(textNode, el);
    if (parent.normalize) parent.normalize();
    this.activeElement = null;
  }
}
