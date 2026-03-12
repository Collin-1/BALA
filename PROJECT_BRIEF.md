# Bala Project Brief

## 1. Executive Summary

Bala is an embeddable SaaS reading widget for article pages. A publisher or content site adds a script and a custom element to their page, and Bala provides a text-to-speech experience directly inside that page.

Core value proposition:

- Convert article pages into readable plain text.
- Play that text aloud in-browser with no server-side audio generation.
- Cache extracted content server-side for repeat access.
- Provide lightweight analytics around listening behavior.
- Support on-page word tracking to follow speech against visible article text.

The current implementation is an MVP focused on proving the product shape, extraction workflow, embed strategy, and playback UX.

## 2. Product Positioning

Bala is not a standalone destination site. The primary product is the embeddable widget loaded on third-party article pages.

Canonical embed model:

```html
<script src="https://BALA_HOST/embed/v1/embed.js" defer></script>
<bala-reader></bala-reader>
```

Optional configuration:

```html
<bala-reader
  url="https://publisher.com/article-123"
  api-base="https://BALA_HOST"
  theme="light"
  position="inline"
  rate="1.0"
  track="true"
  source="dom"
  show-debug="true"
>
</bala-reader>
```

Intended customer:

- News publishers
- Blog/content platforms
- Media brands
- Educational content sites
- Corporate knowledge portals

Primary end-user value:

- Accessibility
- Hands-free article consumption
- Better retention/time-on-content
- Guided listening with optional word tracking

## 3. Current Technology Stack

### Backend

- .NET 8
- ASP.NET Core Minimal API
- EF Core 8
- SQLite
- Microsoft.Playwright
- HtmlAgilityPack

### Frontend / Embed Runtime

- Vanilla JavaScript
- Web Components (`customElements.define`)
- Shadow DOM
- Web Speech API (`speechSynthesis`, `SpeechSynthesisUtterance`)
- CSS Highlights API with fallback span wrapping

### Deployment

- Dockerfile present
- Render-compatible deployment path documented

## 4. High-Level Architecture

```text
Customer Article Page
  -> loads embed.js
  -> renders <bala-reader>
  -> widget resolves Bala API host
  -> widget requests article text from Bala API
  -> Bala API extracts / cleans / caches article text
  -> widget speaks article in browser
  -> widget sends listen events back to Bala API
```

### System Responsibilities

#### Bala.Api

- HTTP endpoints
- static asset hosting for embed script and demo page
- JSON response envelope
- CORS
- startup-time DB initialization

#### Bala.Application

- article orchestration
- event orchestration
- service abstractions and use-case contracts

#### Bala.Infrastructure

- Playwright-based extraction
- HTML-to-text cleanup
- EF Core persistence
- repository implementations

#### Bala.Domain

- core entities (`Article`, `ListenEvent`)

#### Bala.Shared

- shared API response envelope model

## 5. Solution Structure

```text
Bala/
  Bala.sln
  README.md
  PROJECT_BRIEF.md
  Dockerfile
  src/
    Bala.Api/
    Bala.Application/
    Bala.Domain/
    Bala.Infrastructure/
    Bala.Shared/
  tests/
```

## 6. Backend API Overview

Implemented routes:

- `GET /health`
- `GET /v1/articles/by-url?url=...&refresh=...`
- `GET /v1/articles/{articleId}`
- `POST /v1/articles/from-html`
- `POST /v1/events/listen`
- `GET /embed/v1/embed.js`
- `GET /embed/v1/widget`

All JSON responses use a common envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "GUID",
    "timestamp": "ISO-8601"
  }
}
```

### Notes on current API implementation

- URL validation is done in the Minimal API handler.
- `GET /v1/articles/by-url` caches by `SourceUrl`.
- Cache invalidation is currently manual via `refresh=true`.
- Error mapping is basic: `400`, `404`, `422`, `500`.
- Event ingestion is write-only; there is currently no reporting endpoint.

## 7. Article Extraction Pipeline

### Current flow

1. Receive public article URL.
2. Validate URL.
3. Check SQLite cache by `SourceUrl`.
4. If cache miss or refresh requested:
   - open Chromium via Playwright
   - navigate to page
   - wait for `NetworkIdle`
   - extract main content HTML
   - derive best title
   - clean HTML to text
   - compute content hash and reading stats
   - upsert into SQLite
5. Return normalized article payload.

### Extractor design details

Implemented in `PlaywrightArticleExtractor`.

Important behavior:

- Maintains a shared browser instance using a cached `Task<IBrowser>` guarded by `SemaphoreSlim`.
- Uses per-request browser contexts and pages.
- `ExtractMainContentHtmlAsync` removes common noise selectors and chooses:
  - `article`
  - else `main`
  - else largest readable block among `article, main, section, div`
- Title extraction priority:
  - `og:title`
  - `twitter:title`
  - `article h1`
  - `main h1`
  - `h1`
  - `document.title`
  - URL-derived fallback

### HTML cleanup details

Implemented in `HtmlToTextConverter`.

Current heuristics:

- removes noise tags (`script`, `style`, `nav`, `header`, `footer`, `aside`, `form`, `iframe`, `noscript`)
- removes nodes whose class/id matches fragments like:
  - `ad`, `ads`, `advert`, `sponsor`, `promo`, `newsletter`, `cookie`
- prefers `<article>` when available
- otherwise chooses the largest text node
- normalizes whitespace
- computes SHA-256 hash
- estimates reading time using 180 words per minute

### Current extraction limitations

- Heuristic-only extraction; no Readability-class scoring engine yet
- No robust per-site extractor profiles
- No retry or circuit-breaker strategy around navigation failures
- No typed extraction telemetry beyond general logging and HTTP errors

## 8. Persistence Model

### Articles table

- `ArticleId` TEXT PK
- `SourceUrl` TEXT UNIQUE
- `Title` TEXT NULL
- `CleanText` TEXT NOT NULL
- `Language` TEXT NULL
- `WordCount` INTEGER
- `EstimatedMinutes` REAL
- `ContentHash` TEXT
- `CreatedAt` TEXT
- `LastRefreshedAt` TEXT

### ListenEvents table

- `EventId` TEXT PK
- `ArticleId` TEXT
- `SessionId` TEXT
- `EventType` TEXT
- `PositionSeconds` INTEGER
- `UserAgent` TEXT
- `Referrer` TEXT
- `PageUrl` TEXT
- `OccurredAt` TEXT

### Persistence characteristics

- `EnsureCreatedAsync` is used at startup.
- No migration workflow yet.
- SQLite is suitable for local/dev and low-scale MVP.
- For production multi-tenant usage, SQLite is likely a transitional storage choice.

## 9. Widget Design

The widget is implemented entirely in `embed.js` and is the primary customer-facing product surface.

### UI/UX model

- Shadow DOM encapsulation
- compact player frame
- controls for:
  - Play
  - Pause
  - Resume
  - Stop
  - Track toggle
  - speed slider
  - voice selector
- status text
- theme support (`light`, `dark`)
- positioning support (`inline`, `bottom-right`, `bottom-left`)

### Runtime initialization

The widget now resolves `apiBase` using the following precedence:

1. `api-base` attribute
2. origin of the script that loaded `/embed/v1/embed.js`
3. fallback to `window.location.origin`

The `url` value resolves via:

1. `url` attribute
2. fallback `window.location.href`

This allows a customer page to embed Bala with only:

```html
<script src="https://BALA_HOST/embed/v1/embed.js" defer></script>
<bala-reader></bala-reader>
```

## 10. Speech Playback Model

### Primary playback behavior

- widget fetches article payload from Bala API
- title is prepended to spoken content when not already present in body text
- long text is chunked into manageable utterance segments
- chunks are read sequentially with `SpeechSynthesisUtterance`

### Voice selection

- enumerates browser voices from `speechSynthesis.getVoices()`
- supports optional voice matching by substring
- supports language override via `lang`

### Telemetry

Events posted to `/v1/events/listen`:

- `play`
- `pause`
- `resume`
- `stop`
- `ended`

Payload includes:

- `articleId`
- `sessionId`
- `positionSeconds`
- `userAgent`
- `referrer`
- `pageUrl`

## 11. Word Tracking Design

Tracking is one of the more complex parts of the project and is currently implemented as an MVP that has been iterated multiple times.

### Goal

Highlight the currently spoken word inside the article page while speech is running.

### Current design decisions

1. Tracking must not rely on `document.body`.
2. Tracking must align speech text with visible article content.
3. Tracking must not jump backwards when a word repeats.
4. Tracking must exclude ad blocks and sponsored modules.

### Tracking root selection

Priority order:

1. `content-selector` attribute
2. `.article-content`
3. `article`
4. `main`

If none exist, tracking root is considered unavailable.

### Ad exclusion rules

Excluded elements include:

- `.ad-banner`
- `.ad-small`
- `.advertisement`
- `.sponsored`
- `.promo`
- `[data-ad]`
- `[aria-label*=advert i]`
- any element containing `.ad-label`
- any element whose trimmed text equals `Advertisement` or `Sponsored`

Exclusion is ancestor-based, so descendants of excluded nodes are also ignored.

### Tracking source alignment

When `track="true"`, speech source is forced to DOM-derived readable text from the same tracking root. This is important because server-cleaned text can differ structurally from the rendered article, which breaks word alignment.

### Token-map model

Tracking no longer relies on string-search fallback for repeated words.

Current design:

- Build flattened token map once before playback.
- Each token stores:
  - source text node
  - start offset
  - end offset
  - normalized token
  - raw token
- Build chunk token offsets (`chunkBaseTokenIndex`) when chunks are prepared.
- On speech boundary:
  - compute token count in chunk up to `charIndex`
  - map to global token index using `chunkBaseTokenIndex`
  - highlight token at that absolute index
- Global token index only moves forward and resets only on Play.

### Highlight implementation

Preferred:

- CSS Highlights API (`Highlight`, `CSS.highlights.set`)

Fallback:

- span wrapping around active range
- previous span is unwrapped during cleanup

### Performance controls

- boundary updates throttled to 20 updates/second
- token map precomputed once per prepare cycle
- debug mode logs approximate highlight update rate

### Known limitations of current tracking

- Browser `speechSynthesis` boundary events are engine-dependent and not perfectly stable across voices/browsers.
- DOM mutations after token map creation can invalidate token references.
- Token mapping assumes DOM reading order and spoken chunk tokenization remain compatible.

## 12. Current Embed Attributes

Supported attributes:

- `url`
- `api-base`
- `refresh`
- `theme`
- `position`
- `rate`
- `voice`
- `lang`
- `track`
- `source`
- `show-debug`
- `content-selector`

### Important current usage patterns

Minimal embed:

```html
<script src="https://BALA_HOST/embed/v1/embed.js" defer></script>
<bala-reader></bala-reader>
```

Tracking-focused embed:

```html
<script src="https://BALA_HOST/embed/v1/embed.js" defer></script>
<bala-reader
  track="true"
  source="dom"
  content-selector=".article-content"
  show-debug="true"
>
</bala-reader>
```

## 13. Deployment and Operations

### Local

- `dotnet restore`
- `dotnet build`
- install Playwright browser bundle
- `dotnet run --project src/Bala.Api/Bala.Api.csproj`

### Hosting

- Dockerfile exists
- Render deployment path has been prepared/documented
- public deployment requires HTTPS because customer sites often run under HTTPS and browser mixed-content rules apply

### Operational concerns

- Playwright browser version compatibility matters
- browser binaries must exist in deployment runtime
- public embedding requires correct `apiBase` resolution and permissive-but-controlled CORS policy

## 14. What Is Working Today

- Backend extraction API
- SQLite caching
- raw HTML ingestion API
- listen event ingestion
- embeddable widget bootstrapping from any page
- script-origin `apiBase` resolution
- `url` fallback to current page
- browser speech playback
- title reading
- optional word tracking with DOM-sourced content alignment
- debug logging for embed diagnostics

## 15. Current Technical Debt / Risk Areas

### Backend

- no migrations workflow
- no rate limiting
- no authentication/API keys enforced yet
- no extraction retry/backoff policy
- no structured observability pipeline
- no multi-tenant configuration model

### Extraction

- heuristic extraction can still fail on highly scripted or unusual publisher layouts
- ad exclusion is heuristic, not semantic
- no per-publisher extraction tuning yet

### Widget

- browser-dependent speech boundary quality
- tracking still sensitive to DOM changes after initialization
- no mutation observer for long-lived dynamic article pages
- limited accessibility review so far

### Product / Business

- no billing
- no self-serve onboarding
- no publisher settings portal
- no analytics dashboard
- no key management or per-customer usage reporting

## 16. Recommended Next Technical Steps

### Near-term engineering

1. Add integration tests for extractor against fixture HTML pages.
2. Add automated tests for token-map tracker behavior on repeated words and ad-heavy layouts.
3. Move from `EnsureCreated` to EF migrations.
4. Add structured logging and request correlation for extraction failures.
5. Add optional API-key enforcement and rate limiting.

### Mid-term product hardening

1. Add per-publisher configuration profiles:
   - preferred root selector
   - ad selectors
   - title selectors
2. Add usage metering and customer-level event aggregation.
3. Add admin/support tooling for extraction diagnostics.
4. Consider Postgres for multi-instance persistence.

### Long-term product paths

1. Server-side TTS option for consistent audio.
2. Voice branding / premium voice selection.
3. Transcript synchronization and richer reading UX.
4. Enterprise accessibility positioning.

## 17. Questions a Senior Engineer Should Evaluate

- Is the current layering sufficient or should extraction/tracking be split into clearer modules?
- Should article extraction remain heuristic or move to a readability/parser abstraction?
- Is SQLite acceptable beyond MVP, or should persistence move now?
- How should multi-tenant auth, rate limiting, and per-customer config be modeled?
- Should tracking continue client-side only, or should there be a hybrid sync model?
- What observability is required before publisher rollout?

## 18. Questions a Business Coach / Product Advisor Should Evaluate

- Which publisher segment is the first realistic paying customer?
- Is Bala best sold as accessibility tooling, engagement tooling, or premium reader experience?
- What is the simplest pricing model for MVP validation?
- What proof points matter most to customers: time-on-page, accessibility compliance, completion rate, or retention?
- Is word tracking a premium differentiator or just a supporting feature?

## 19. Summary

Bala is currently a technically credible MVP for embeddable article reading. The architecture demonstrates the right product direction: embeddable widget first, backend as extraction/cache service, browser speech for low-cost delivery, and a tracking system that is evolving toward deterministic DOM-aligned highlighting.

The project is not yet production-hardened, but it is far enough along for a senior engineer to assess technical direction and for a business coach to help refine customer positioning, pricing, and rollout strategy.
