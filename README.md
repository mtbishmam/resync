# ReSync

A fast, intentional video and reading library.

RePlay is the curated video feed and ReRead is the matching blog/article feed.
Both use Inbox, a 5-minute testing cooldown, Queue, and Finished. The final
release will use a 24-hour cooldown. Pasted links enter Inbox directly.
Type (`Watch` or `Read`), multi-select Topics (`AI`, `CP`, `Tech`, and
`Business`), notes, and workflow state sync to D1. It supports YouTube metadata enrichment,
duplicate and invalid-link prevention, removal with undo, a fullscreen 70/30
player and notes workspace, a resizable sidebar, grid/list views, filtering,
search, and sorting.

Without `YOUTUBE_API_KEY`, YouTube oEmbed supplies only title, channel, and
thumbnail. Configure the key server-side to also retrieve duration, description,
publish date, tags, caption availability, and embeddability.

Videos and notes use Cloudflare D1 as their durable source of truth. Browser
storage remains as an instant local cache and automatically migrates into D1
the first time the updated app loads.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use `npm run build` to verify the production build.

`OPENAI_API_KEY` is reserved for the upcoming transcript analysis and chat
backend. That analysis will recommend `watch`, `skim`, or `summary_only` based
on what is genuinely new for the user. Keep both API keys server-side in
`.env.local` and in hosted secret storage; never expose them to browser code.
