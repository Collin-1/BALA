# Listen to this article — embeddable audio widget (MVP)

A drop-in **"▶ Listen"** widget that reads the *main article text* of any page
aloud, plus a small ASP.NET Core backend that records play/completion analytics
per publisher.

Everything runs on the **free tier**: text-to-speech uses the browser's built-in
[Web Speech API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis),
article extraction uses bundled [Mozilla Readability](https://github.com/mozilla/readability),
and analytics are stored in memory. No paid TTS, no cloud accounts.

```
BALA/
├─ public/
│  ├─ article.html         # demo "news article" with nav, ads, cookie banner
│  ├─ embed.js             # GENERATED self-contained widget (Readability + widget)
│  ├─ src/widget.js        # widget source (edit this)
│  └─ vendor/Readability.js# bundled Mozilla Readability (Apache-2.0)
├─ backend/                # ASP.NET Core (.NET 10) minimal API
│  └─ Program.cs
├─ tools/test-extraction.js# headless test: article kept, ads/nav/cookie stripped
├─ build-embed.js          # bundles vendor + src -> public/embed.js
└─ package.json
```

---

## What it does

**`embed.js`** — one script tag, no framework, no runtime CDN:

```html
<script src="/embed.js" data-site="demo"></script>
```

On load it:
1. Injects a floating **▶ Listen** button.
2. On click, extracts only the main article text with **Mozilla Readability**
   (ads, nav, cookie banners, sidebars, footers excluded).
3. Reads it aloud via `window.speechSynthesis`.
4. Provides **play / pause / stop**, a **progress bar**, and **voice + speed**
   selectors populated from the system voices.
5. Fires analytics events to the backend on **play** and on **completion**.

Optional attribute: `data-api="https://your-backend/api"` to point the widget at
a backend on another origin (defaults to same-origin `/api`).

**Backend** — minimal API:
| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/track` | record `{ siteId, articleUrl, action, timestamp }` |
| `GET`  | `/api/stats/{siteId}` | play count, completion count, completion rate, per-article breakdown |
| `GET`  | `/api/health` | health check |

CORS is open to any origin so the widget works when embedded on real sites.
The backend also serves the `public/` folder, so the demo page, `embed.js`, and
the API are all same-origin during local dev.

---

## Run it locally

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download) (`dotnet --version` → 10.x)
- A Chromium or Edge browser (best Web Speech API voice support)
- Node.js (only to re-build `embed.js` or run the extraction test — `embed.js`
  is already committed)

### 1. (Optional) rebuild the widget bundle
`public/embed.js` is already built. Only needed if you edit `public/src/widget.js`:
```bash
npm run build        # = node build-embed.js
```

### 2. Start the backend (also serves the demo)
```bash
cd backend
dotnet run
```
It listens on **http://localhost:5179**.

### 3. Open the demo article
Navigate to **http://localhost:5179/article.html** and click **▶ Listen**.

> Browsers only speak after a user gesture, so press the button to start audio.

---

## How to verify ads / menus are excluded

The demo page deliberately contains junk that must **not** be read aloud:
a nav bar, a leaderboard ad, an inline ad, a sidebar with ads + "Most Popular",
a footer, and a cookie banner.

**Option A — automated (headless, no browser):**
```bash
npm install            # installs jsdom (dev only)
npm run test:extract   # = node tools/test-extraction.js
```
It runs Readability over `public/article.html` and asserts the article body is
present while every junk phrase ("ADVERTISEMENT", "Accept all cookies",
"Subscribe Now", "© 2026 The Daily Bugle", …) is absent. Expected result:
`✅ all extraction assertions passed`.

> If `npm install` fails with a TLS/certificate error behind a proxy, use
> `npm install --strict-ssl=false`.

**Option B — in the browser:**
1. Open `http://localhost:5179/article.html`, click **▶ Listen**, and listen —
   it begins at *"City Council Approves Riverfront Park Expansion…"* and never
   reads the ads, menu, or cookie banner.
2. Or inspect what it would read, in DevTools console:
   ```js
   new Readability(document.cloneNode(true)).parse().textContent
   ```
   (`Readability` is in scope inside the embed bundle; or paste the snippet
   while `embed.js` is loaded.)

## How to verify analytics

With the backend running, click **▶ Listen** (fires `play`) and let it finish
(fires `complete`). Then:
```bash
curl http://localhost:5179/api/stats/demo
```
```json
{ "siteId":"demo", "playCount":1, "completeCount":1, "completionRate":1.0,
  "totalEvents":2, "byArticle":[{ "articleUrl":"…/article.html","plays":1,"completes":1 }] }
```

---

## Swapping the TTS engine later (Polly / Azure)

The widget talks to text-to-speech only through a small interface marked in
`public/src/widget.js` with:

```js
// === TTS ENGINE SEAM ===
```

`WebSpeechEngine` is the default implementation. To move to a server-side engine
(Amazon Polly, Azure Speech, ElevenLabs), implement the same interface
(`listVoices / speak / pause / resume / stop / isPaused / onVoicesChanged`) so
that `speak()` POSTs the text to your backend, receives an audio URL/stream, and
drives an `<audio>` element — keeping `onProgress`/`onEnd` semantics identical.
Then change one line in `boot()` to construct your engine instead of
`WebSpeechEngine`. No UI changes required.

## Notes & limitations (MVP)
- Analytics are **in-memory** and reset when the backend restarts. The storage
  sits behind `IEventStore` in `Program.cs`, so a SQLite-backed implementation
  is a one-class swap.
- Web Speech API voice quality/availability varies by OS/browser; Edge and
  Chrome expose the most voices.
- `embed.js` is committed so the demo runs without Node; rebuild after editing
  the source.
