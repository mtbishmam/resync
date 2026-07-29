# ReSync — RePlay

A fast, intentional YouTube watch-later library inside ReSync.

The current version is a frontend-first prototype. It supports instant link
capture, YouTube title/channel/thumbnail enrichment, a 20-minute watch cooldown,
duplicate prevention, removal with undo, a focused 70/30 player and notes
workspace, status and topic filters, search, sorting, and device-local
persistence. Cloud sync, complete YouTube metadata, transcripts, and AI analysis
are intentionally deferred to the backend phase.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Use `npm run build` to verify the production build.
