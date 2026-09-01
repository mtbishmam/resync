import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("YouTube thumbnails have storage, network, and render fallbacks", async () => {
  const page = await source("app/page.tsx");
  const youtube = await source("app/api/youtube/route.ts");
  const library = await source("db/library.ts");
  const capture = await source("app/api/capture/route.ts");

  assert.match(page, /function youtubeThumbnailCandidates/);
  assert.match(page, /https:\/\/img\.youtube\.com\/vi/);
  assert.match(page, /onError=\{\(\) =>/);
  assert.match(page, /!video\.thumbnailUrl/);
  assert.match(youtube, /metadata\.thumbnail_url \|\| fallbackThumbnail/);
  assert.match(youtube, /thumbnailUrl: fallbackThumbnail\(videoId\)/);
  assert.match(library, /repairMissingYoutubeThumbnails/);
  assert.match(library, /UPDATE items SET thumbnail_url/);
  assert.match(capture, /thumbnailUrl: youtubeId/);
});
