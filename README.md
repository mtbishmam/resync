# ReSync — RePlay

A fast, intentional YouTube watch-later library inside ReSync.

The current version is a frontend-first prototype. RePlay is the curated feed;
selected videos move through Inbox, a 20-minute cooldown, Queue, and Watched.
Pasted links enter Inbox directly. It supports YouTube metadata enrichment,
duplicate and invalid-link prevention, removal with undo, a fullscreen 70/30
player and notes workspace, a resizable sidebar, grid/list views, filtering,
search, sorting, and device-local persistence.

Without `YOUTUBE_API_KEY`, YouTube oEmbed supplies only title, channel, and
thumbnail. Configure the key server-side to also retrieve duration, description,
publish date, tags, caption availability, and embeddability.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use `npm run build` to verify the production build.

Videos and notes still use browser storage. The next persistence phase will use
Cloudflare D1 through Drizzle; the current D1 schema and hosted binding are
intentionally empty.
