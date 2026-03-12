# Bala ("to read")

For a full technical and product handoff document, see [PROJECT_BRIEF.md](PROJECT_BRIEF.md).

Production-ready MVP that turns any public article URL into cleaned text, caches it in SQLite, and exposes an embeddable Web Speech widget.

## Stack

- .NET 8 Minimal API
- Playwright (server-side extraction)
- EF Core + SQLite (`bala.db`)
- Static hosting for `embed.js`
- CORS enabled (allow all origins)

## Quick start

1. Restore and build:
   ```bash
   dotnet restore
   dotnet build
   ```
2. Install Playwright browsers (once):
   ```bash
   dotnet tool install --global Microsoft.Playwright.CLI
   playwright install
   ```
   or run after first build:
   ```bash
   pwsh ./src/Bala.Api/bin/Debug/net8.0/playwright.ps1 install
   ```
3. Run API:
   ```bash
   dotnet run --project src/Bala.Api/Bala.Api.csproj
   ```
   API listens on `http://localhost:5000` by default (Kestrel standard). `bala.db` is created automatically.

## API (base: /v1)

- `GET /health` → `ok`
- `GET /v1/articles/by-url?url={http(s)}` (optional `refresh=true`)
- `GET /v1/articles/{articleId}`
- `POST /v1/articles/from-html` `{ sourceUrl?, title?, html }`
- `POST /v1/events/listen` `{ articleId, eventType, positionSeconds, sessionId, userAgent?, referrer?, pageUrl? }`

All JSON responses use:

```json
{
  "success": true/false,
  "data": {},
  "error": { "code": "...", "message": "...", "details": null },
  "meta": { "requestId": "GUID", "timestamp": "ISO-8601" }
}
```

## Embeddable widget

Include script:

````html
<script src="https://YOUR_API_HOST/embed/v1/embed.js" defer></script>

Drop the element:

```html
<bala-reader
  url="https://customer.com/article"
  api-base="https://YOUR_API_HOST"
  theme="light"
  position="inline"
## Add Bala to your website (primary product)
Include the embed script and custom element on your pages—Bala is an embeddable SaaS widget, not a standalone site UI.
```html
<script src="http://localhost:5000/embed/v1/embed.js" defer></script>
<bala-reader url="https://example.com/article" api-base="http://localhost:5000"></bala-reader>
````

Key attributes: `url` (required), `api-base` (defaults to same origin), `refresh` (true/false), `theme` (light/dark), `position` (inline/bottom-right/bottom-left), `rate`, `voice`, `lang`.

Widget behavior:

- Renders inside Shadow DOM when `<bala-reader>` is present.
- On Play, fetches `/v1/articles/by-url?url=...` if not already cached client-side, chunks text (1500–2800 chars), and speaks sequentially via Web Speech API.
- Sends lightweight analytics (`play`, `pause`, `resume`, `stop`, `ended`) to `/v1/events/listen` with session/page context.

Demo-only page (not the product): `http://localhost:5000/embed/v1/widget`.
Attributes: `url` (required), `api-base` (optional, defaults to same origin), `refresh` (true/false), `theme` (light/dark), `position` (inline/bottom-right/bottom-left), `rate`, `voice`, `lang`.

The widget fetches `/v1/articles/by-url`, chunks text (1500–2800 chars), and streams through the Web Speech API with basic analytics to `/v1/events/listen`.

For local demo, open `http://localhost:5000/embed/v1/widget` after running the API.

## Notes

- Playwright browser instance is reused via a singleton for perf.
- Reading speed estimate uses 180 wpm.
- Language detection is lightweight and best-effort.
- Add a reverse proxy/HTTPS and API keys before production hardening.
