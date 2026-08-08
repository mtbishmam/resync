import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

async function loadBackground(options = {}) {
  const state = {};
  const createdTabs = [];
  const removedTabs = [];
  const badgeUpdates = [];
  const notifications = [];
  const alarms = [];
  const tabMessages = [];
  let messageListener;
  let tabUpdatedListener;

  const storage = {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        requested
          .filter((key) => Object.hasOwn(state, key))
          .map((key) => [key, structuredClone(state[key])]),
      );
    },
    async set(values) {
      await Promise.resolve();
      Object.assign(state, structuredClone(values));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete state[key];
      }
    },
  };

  const chrome = {
    action: {
      async setBadgeBackgroundColor(update) {
        badgeUpdates.push({ type: "color", ...update });
      },
      async setBadgeText(update) {
        badgeUpdates.push({ type: "text", ...update });
      },
    },
    alarms: {
      async clear(name) {
        alarms.push({ type: "clear", name });
      },
      async create(name, options) {
        alarms.push({ type: "create", name, ...options });
      },
      onAlarm: { addListener() {} },
    },
    notifications: {
      async create(id, options) {
        notifications.push({ id, ...options });
      },
    },
    runtime: {
      getURL(path) {
        return `chrome-extension://resync/${path}`;
      },
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    storage: { local: storage },
    tabs: {
      async create(options) {
        createdTabs.push(options);
        return { id: createdTabs.length, ...options };
      },
      async remove(tabId) {
        removedTabs.push(tabId);
      },
      async query() {
        return [{ id: 900, url: "https://resync.mtbishmam.chatgpt.site/" }];
      },
      async sendMessage(tabId, message) {
        tabMessages.push({ tabId, message });
        return { ok: true };
      },
      onUpdated: {
        addListener(listener) {
          tabUpdatedListener = listener;
        },
      },
    },
  };

  const source = await readFile(
    new URL("../extension/background.js", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(source, {
    chrome,
    crypto: webcrypto,
    Date,
    Error,
    Promise,
    fetch: options.fetch,
    URLSearchParams,
    encodeURIComponent,
  });
  assert.equal(typeof messageListener, "function");

  function sendMessage(message, sender = {}) {
    return new Promise((resolve, reject) => {
      let responded = false;
      const keepChannelOpen = messageListener(message, sender, (response) => {
        responded = true;
        resolve(response);
      });
      if (keepChannelOpen !== true) {
        queueMicrotask(() => {
          if (!responded) resolve(undefined);
        });
      }
      setTimeout(() => {
        if (!responded) reject(new Error("Background response timed out."));
      }, 1_000);
    });
  }

  async function flushQueue() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    alarms,
    badgeUpdates,
    createdTabs,
    flushQueue,
    notifications,
    removedTabs,
    sendMessage,
    state,
    tabMessages,
    updateTab(tabId, changeInfo) {
      tabUpdatedListener(tabId, changeInfo);
    },
  };
}

test("a direct capture updates an already-open ReSync tab", async () => {
  const savedItem = {
    id: "captured-item",
    url: "https://example.com/new",
    title: "New article",
    type: "Read",
    status: "inbox",
  };
  const background = await loadBackground({
    fetch: async () =>
      new Response(
        JSON.stringify({ item: savedItem, message: "Saved to Inbox." }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  const capture = await background.sendMessage({
    type: "resync-enqueue-capture",
    sourceTabId: 201,
    capture: {
      url: savedItem.url,
      title: savedItem.title,
      content: "A sufficiently long article body for direct delivery testing.",
    },
  });
  await background.flushQueue();

  assert.equal(capture.ok, true);
  assert.equal(background.createdTabs.length, 0);
  assert.equal(background.state.pendingCaptures.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(background.tabMessages)), [
    {
      tabId: 900,
      message: {
        type: "resync-item-captured",
        item: savedItem,
        message: "Saved to Inbox.",
      },
    },
  ]);
});

test("rapid captures remain separate and acknowledgements remove only their match", async () => {
  const background = await loadBackground();
  const firstRequest = background.sendMessage({
    type: "resync-enqueue-capture",
    sourceTabId: 301,
    capture: {
      url: "https://www.youtube.com/watch?v=first",
      title: "First",
      content: "A sufficiently long transcript for the first saved video.",
    },
  });
  const secondRequest = background.sendMessage({
    type: "resync-enqueue-capture",
    sourceTabId: 302,
    capture: {
      url: "https://www.youtube.com/watch?v=second",
      title: "Second",
      content: "A sufficiently long transcript for the second saved video.",
    },
  });
  const [first, second] = await Promise.all([firstRequest, secondRequest]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.captureId, second.captureId);
  assert.equal(background.state.pendingCaptures[0].sourceTabId, 301);
  assert.equal(background.state.pendingCaptures[1].sourceTabId, 302);
  assert.deepEqual(
    background.state.pendingCaptures.map((capture) => capture.captureId),
    [first.captureId, second.captureId],
  );
  assert.equal(background.createdTabs.length, 1);

  await background.sendMessage(
    {
      type: "resync-capture-result",
      captureId: first.captureId,
      ok: true,
      message: "Saved.",
    },
    { tab: { id: 1 } },
  );
  await background.flushQueue();

  assert.deepEqual(
    background.state.pendingCaptures.map((capture) => capture.captureId),
    [second.captureId],
  );
  assert.deepEqual(background.removedTabs, [1]);
  assert.equal(background.state.captureFeedback.captureId, first.captureId);
  assert.equal(background.state.captureFeedback.ok, true);
  assert.equal(background.notifications.length, 1);
  assert.equal(background.notifications[0].title, "Saved to ReSync");
  assert.equal(
    background.notifications[0].iconUrl,
    "chrome-extension://resync/icons/icon128.png",
  );
  assert.deepEqual(background.badgeUpdates.at(-1), {
    type: "text",
    text: "✓",
    tabId: 301,
  });

  assert.equal(background.createdTabs.length, 2, "the next capture starts only after the first is acknowledged");
});

test("a failed acknowledgement keeps its capture queued for retry", async () => {
  const background = await loadBackground();
  const capture = await background.sendMessage({
    type: "resync-enqueue-capture",
    sourceTabId: 401,
    capture: {
      url: "https://example.com/article",
      title: "Article",
      content: "A sufficiently long article body that should remain queued.",
    },
  });

  await background.sendMessage(
    {
      type: "resync-capture-result",
      captureId: capture.captureId,
      ok: false,
      message: "No confirmation.",
    },
    { tab: { id: 1 } },
  );
  await background.flushQueue();

  assert.equal(background.state.pendingCaptures.length, 1);
  assert.equal(
    background.state.pendingCaptures[0].captureId,
    capture.captureId,
  );
  assert.equal(background.state.captureFeedback.ok, false);
  assert.ok(
    background.alarms.some(
      (alarm) =>
        alarm.type === "create" && alarm.name === "resync-capture-retry",
    ),
  );
  assert.ok(
    background.badgeUpdates.some(
      (update) =>
        update.type === "text" &&
        update.text === "!" &&
        update.tabId === 401,
    ),
  );
  assert.deepEqual(background.removedTabs, [1]);
});
