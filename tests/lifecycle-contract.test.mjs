import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("production starts empty and lifecycle views use persisted timestamps", async () => {
  const page = await source("app/page.tsx");
  const library = await source("db/library.ts");
  const analyze = await source("app/api/analyze/route.ts");
  const capture = await source("app/api/capture/route.ts");

  assert.match(page, /const starterVideos: Video\[\] = \[\];/);
  assert.match(page, /\["history", "History"\]/);
  assert.match(page, /\["favorites", "Favorites"\]/);
  assert.match(page, /\["liked", "Liked"\]/);
  assert.match(page, /\["archived", "Archive"\]/);
  assert.doesNotMatch(page, /activeStatus === "inbox" \|\| sort === "newest"/);
  assert.match(page, /if \(sort === "newest"\) return b\.addedAt - a\.addedAt/);
  assert.match(page, /b\.finishedAt \?\? b\.addedAt/);
  assert.match(page, /latestHistoryAt\.get\(b\.id\)/);
  assert.match(page, /ARCHIVE_AFTER_MS/);
  assert.doesNotMatch(page, /COOLDOWN_MINUTES/);
  assert.doesNotMatch(analyze, /cooldown_pending/);
  assert.match(capture, /status: "inbox"[\s\S]*cooldownUntil: 0/);
  assert.match(library, /finished_at/);
  assert.match(library, /archived_at/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS consumption_history/);
  assert.match(library, /favorite INTEGER DEFAULT 0 NOT NULL/);
  assert.match(library, /liked INTEGER DEFAULT 0 NOT NULL/);
});

test("item deletion is explicit, cascades D1 children, and cleans unshared R2 objects", async () => {
  const route = await source("app/api/library/route.ts");
  const storage = await source("lib/source-storage.ts");
  const library = await source("db/library.ts");

  assert.match(route, /export async function DELETE/);
  assert.doesNotMatch(route, /for \(const item of existing\.results/);
  assert.match(storage, /AND item_id <> \?2/);
  assert.match(storage, /await r2\.delete\(source\.object_key\)/);
  assert.match(library, /REFERENCES items\(id\) ON DELETE CASCADE/);
});

test("mobile navigation exposes nested sections without a second oversized row", async () => {
  const css = await source("app/globals.css");
  const layout = await source("app/layout.tsx");

  assert.match(css, /\.nav-protocol\s*\{\s*display:\s*contents/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /icon128\.png/);
});
