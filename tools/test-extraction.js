/*
 * test-extraction.js
 *
 * Headless verification that Mozilla Readability extracts ONLY the article body
 * from public/article.html — and excludes the nav bar, ads, sidebar, cookie
 * banner, and footer. Runs in Node via jsdom (no browser needed).
 *
 * Setup:  npm install jsdom
 * Run:    node tools/test-extraction.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const Readability = require("../public/vendor/Readability.js");

const html = fs.readFileSync(
  path.join(__dirname, "..", "public", "article.html"),
  "utf8"
);

const dom = new JSDOM(html, { url: "http://localhost:5179/article.html" });
const article = new Readability(dom.window.document).parse();

if (!article) {
  console.error("FAIL: Readability returned null (no article detected).");
  process.exit(1);
}

const text = article.textContent.replace(/\s+/g, " ").trim();

// Phrases that MUST appear (real article body).
const mustInclude = [
  "city council voted 6 to 1",
  "Riverfront Park",
  "Aisha Okoro",
  "groundbreaking ceremony",
];

// Phrases that MUST NOT appear (nav / ads / sidebar / cookie banner / footer).
const mustExclude = [
  "ADVERTISEMENT",
  "SuperWidget Pro",
  "Refinance your home",
  "Win a free cruise",
  "Accept all cookies",
  "We use cookies",
  "Subscribe Now",
  "Most Popular",
  "© 2026 The Daily Bugle",
];

let failed = false;

console.log("Extracted title: " + article.title);
console.log("Extracted length: " + article.textContent.length + " chars\n");

console.log("--- Must INCLUDE (article body) ---");
for (const p of mustInclude) {
  const ok = text.toLowerCase().includes(p.toLowerCase());
  console.log((ok ? "  PASS  " : "  FAIL  ") + p);
  if (!ok) failed = true;
}

console.log("\n--- Must EXCLUDE (ads / nav / cookie / footer) ---");
for (const p of mustExclude) {
  const ok = !text.toLowerCase().includes(p.toLowerCase());
  console.log((ok ? "  PASS  " : "  FAIL  ") + "(no) " + p);
  if (!ok) failed = true;
}

console.log("\n--- First 240 chars of extracted text ---");
console.log(text.slice(0, 240) + "...");

if (failed) {
  console.error("\nRESULT: ❌ extraction test FAILED");
  process.exit(1);
} else {
  console.log("\nRESULT: ✅ all extraction assertions passed");
}
