import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the deployed app binds D1 for structure and R2 for source bodies", async () => {
  const hosting = JSON.parse(await source(".openai/hosting.json"));
  const worker = await source("worker/index.ts");
  const storage = await source("lib/source-storage.ts");

  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "R2");
  assert.match(worker, /DB:\s*D1Database/);
  assert.match(worker, /R2:\s*R2Bucket/);
  assert.match(storage, /sources\/\$\{contentHash\.slice\(0,\s*2\)\}/);
  assert.match(storage, /await r2\.put\(objectKey,\s*bodyText/);
  assert.match(storage, /storage_backend[\s\S]*'r2'/);
  assert.match(storage, /body_text = ''/);
});

test("legacy migration preserves completed analysis and clears duplicate D1 text", async () => {
  const storage = await source("lib/source-storage.ts");

  assert.ok(
    storage.match(/markAnalysisPending:\s*false/g)?.length >= 2,
    "lazy and batch migrations must preserve analysis status",
  );
  assert.match(
    storage,
    /UPDATE transcripts[\s\S]*SET body_text = ''[\s\S]*WHERE item_id = \?1/,
  );
  assert.match(
    storage,
    /if \(migrateLegacy\)[\s\S]*storeSourceDocument\([\s\S]*markAnalysisPending:\s*false/,
  );
});

test("the D1 migration is additive and transfer files omit large R2 bodies", async () => {
  const migration = await source("drizzle/0005_rare_slapstick.sql");
  const transfer = await source("app/api/transfer/route.ts");

  assert.match(migration, /ALTER TABLE `source_documents` ADD `storage_backend`/);
  assert.match(migration, /ALTER TABLE `source_documents` ADD `object_key`/);
  assert.match(migration, /ALTER TABLE `source_documents` ADD `byte_size`/);
  assert.match(migration, /ALTER TABLE `source_documents` ADD `storage_status`/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|UPDATE)\b/i);
  assert.match(transfer, /sourceContentIncluded:\s*false/);
  assert.match(transfer, /sourceManifest/);
});

test("uploaded media remains transient", async () => {
  const transcribe = await source("app/api/transcribe/route.ts");

  assert.doesNotMatch(transcribe, /\bgetR2\b|\bR2Bucket\b|\.put\(/);
  assert.match(transcribe, /analyzeAndStoreTranscript/);
});
