# ReSync

A fast, intentional video and reading library.

RePlay is the curated video feed and ReRead is the matching blog/article feed.
Both use Inbox, a 5-minute testing cooldown, Queue, and Finished. The final
release will use a 24-hour cooldown. Pasted links enter Inbox directly.
ReSync detects YouTube links as `Watch` and other web links as `Read`.
When an official transcript is accessible, GPT-5.4 mini also selects the
multi-select Topics (`AI`, `CP`, `Tech`, and `Business`) and recommends
`watch`, `skim`, or `summary_only`. Notes and workflow state sync to D1. It
supports YouTube metadata enrichment, duplicate and invalid-link prevention,
removal with undo, a fullscreen 70/30 player and notes workspace, a resizable
sidebar, grid/list views, filtering, search, and sorting.

Without `YOUTUBE_API_KEY`, YouTube oEmbed supplies only title, channel, and
thumbnail. Configure the key server-side to also retrieve duration, description,
publish date, tags, caption availability, and embeddability.

Cloudflare D1 is the durable source of truth. The normalized schema stores
items, one Markdown note per item, optional note anchors, chat threads and
messages, and versioned AI analyses separately. Browser storage remains as an
instant local cache. The previous JSON snapshot migrates into the normalized
tables once and remains untouched as a backup.

YouTube's official captions API requires OAuth and only permits a transcript
download when the signed-in account can edit the video. An API key can report
caption availability but cannot download arbitrary public-video transcripts.
When ReSync cannot access a transcript, it displays `Transcript unavailable`
and does not call OpenAI or fall back to audio transcription.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use `npm run build` to verify the production build.

Set `OPENAI_API_KEY` for GPT-5.4 mini analysis. Keep API credentials server-side
in `.env.local` and in hosted secret storage; never expose them to browser code.
