# ReSync

A fast, intentional video and reading library.

## Deployment identity

The public identity is a hard requirement: `ReSync` must deploy to
`resync.mtbishmam.chatgpt.site`. A generated, abbreviated, or legacy hostname
must never be accepted as a replacement. Before any future migration or new
deployment, run `npm run verify:site -- resync.mtbishmam.chatgpt.site`; it
refuses to pass without the explicit target or if the target differs.

The existing legacy Sites project is preserved until a replacement with this
exact hostname is live and verified. Do not delete the legacy project during
that transition.

RePlay is the curated video feed and ReRead is the matching blog/article feed.
Both use Inbox, a 5-minute testing cooldown, Queue, and Finished. The final
release will use a 24-hour cooldown. Pasted links enter Inbox directly.
ReSync detects YouTube links as `Watch` and other web links as `Read`.
GPT-5.4 mini selects the multi-select Topics (`AI`, `CP`, `Tech`, and
`Business`), scores personal value, and recommends `watch`, `skim`, or
`summary_only`. Notes and workflow state sync to D1. It supports YouTube
metadata enrichment, duplicate and invalid-link prevention, removal with undo,
a fullscreen 70/30 player and notes workspace, a resizable sidebar, grid/list
views, filtering, search, and sorting.

Without `YOUTUBE_API_KEY`, YouTube oEmbed supplies only title, channel, and
thumbnail. Configure the key server-side to also retrieve duration, description,
publish date, tags, caption availability, and embeddability.

Cloudflare D1 is the durable source of truth. The normalized schema stores
items, one Markdown note per item, optional note anchors, generic source
documents (video transcripts or article text), chat threads and messages, and
versioned AI analyses separately. It also stores AI learning summaries derived
from the user's own notes and per-item AI usage events. Those learning summaries
become the prior-knowledge baseline for future scores, reducing novelty,
information density, time efficiency, and actionability when content repeats
what the user already learned. Browser storage remains as an instant local cache.
The previous JSON snapshot migrates into the normalized tables once and remains
untouched as a backup.

YouTube's official captions API requires OAuth and only permits a transcript
download when the signed-in account can edit the video. An API key can report
caption availability but cannot download arbitrary public-video transcripts.
When that happens, ReSync accepts a full transcript pasted by the user or sent
by the extension. It can also send an uploaded MP3, MP4, MPEG, MPGA, M4A, WAV,
or WEBM file (25 MB maximum) to `gpt-transcribe`, with Bengali and English as
language hints. Uploaded media is processed transiently and is not stored;
the resulting transcript is saved in D1 before analysis.

The Chromium extension in `extension/` first tries to open and read YouTube's
visible transcript panel. If that fails, its popup accepts a manual transcript.
Every other HTTP(S) page is treated as an article unless the extension later
adds an explicit site rule. It extracts readable page text and hands it to the
private ReSync site. GPT-5.4 mini runs only after the cooldown ends, then adds a
summary, value score, and `watch`, `skim`, or `summary_only` recommendation.

The item chat is active and stored in `chat_threads` and `chat_messages`,
separately from working notes. Each answer is grounded in the captured source,
latest analysis, and the item's Markdown note when available.

The profile panel lists saved notes by date with topic filters, shows the
AI-generated learning summaries, documents the five scoring factors and active
models, and reports request-level token usage. Cost figures use standard API
list prices when a public model price is available; account-wide free allowances
are not subtracted because individual API responses do not report whether those
credits were applied.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use `npm run build` to verify the production build.

Set `OPENAI_API_KEY` for the pinned `gpt-5.4-mini-2026-03-17` analysis model and
`gpt-transcribe`. Keep API credentials server-side in `.env.local` and in hosted
secret storage; never expose them to browser code.

## Extension capture

Load `extension/` as an unpacked extension from `brave://extensions`. The
extension stores a pending capture locally, opens the private ReSync URL, and
uses its bridge content script to hand the capture to the authenticated app.
The app accepts:

```json
{
  "url": "https://example.com/item",
  "title": "Page title",
  "author": "Channel or hostname",
  "content": "YouTube transcript or readable article text"
}
```

The app saves this JSON through `POST /api/capture`.
