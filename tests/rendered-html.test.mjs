import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ReSync library shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ReSync<\/title>/i);
  assert.match(html, /Save the urge\./);
  assert.match(html, /Watch/);
  assert.match(html, /with intention\./);
  assert.match(html, /Paste a YouTube link/);
  assert.match(html, /ReSync \//);
  assert.match(html, /RePlay/);
  assert.match(html, /ReRead/);
  assert.match(html, /Add to Inbox/);
  assert.match(html, /Curated discoveries become intentional choices/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});
