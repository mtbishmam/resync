const RESYNC_URL = "https://resync.mtbishmam.chatgpt.site";
const RETRY_ALARM = "resync-capture-retry";
const RETRY_DELAY_MINUTES = 2;
const HISTORY_LIMIT = 500;
let queueOperation = Promise.resolve();
let deliveryRunning = false;
let currentDeliveryId = null;

function withQueueLock(operation) {
  const nextOperation = queueOperation.then(operation, operation);
  queueOperation = nextOperation.catch(() => {});
  return nextOperation;
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

async function setBadge(text, color, title = "Capture in ReSync", tabId) {
  const tabDetails = Number.isInteger(tabId) ? { tabId } : {};
  await chrome.action.setBadgeBackgroundColor({ color, ...tabDetails });
  await chrome.action.setBadgeText({ text, ...tabDetails });
  if (chrome.action.setTitle) await chrome.action.setTitle({ title, ...tabDetails });
}

async function readQueue() {
  const { pendingCaptures, pendingCapture } = await chrome.storage.local.get([
    "pendingCaptures",
    "pendingCapture",
  ]);
  const queue = Array.isArray(pendingCaptures)
    ? pendingCaptures.filter(
        (capture) => capture?.captureId && typeof capture.url === "string",
      )
    : [];
  if (pendingCapture?.captureId && !queue.some((item) => item.captureId === pendingCapture.captureId)) {
    queue.push(pendingCapture);
  }
  return queue;
}

async function writeQueue(queue) {
  await chrome.storage.local.set({ pendingCaptures: queue });
  await chrome.storage.local.remove("pendingCapture");
}

async function syncRetryAlarm(queue) {
  if (queue.length) {
    await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: RETRY_DELAY_MINUTES });
  } else {
    await chrome.alarms.clear(RETRY_ALARM);
  }
}

async function recordHistory(capture) {
  const { captureHistory } = await chrome.storage.local.get("captureHistory");
  const history = Array.isArray(captureHistory) ? captureHistory : [];
  const url = canonicalUrl(capture.url);
  const next = [
    { url, title: capture.title || url, savedAt: Date.now() },
    ...history.filter((item) => canonicalUrl(item.url) !== url),
  ].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ captureHistory: next });
}

async function restoreBadgeForTab(tabId, url) {
  if (!Number.isInteger(tabId) || typeof url !== "string") return;
  const [{ pendingCaptures, captureHistory }] = await Promise.all([
    chrome.storage.local.get(["pendingCaptures", "captureHistory"]),
  ]);
  const target = canonicalUrl(url);
  if ((pendingCaptures ?? []).some((item) => canonicalUrl(item.url) === target)) {
    await setBadge("…", "#555555", "ReSync: capture queued", tabId);
  } else if ((captureHistory ?? []).some((item) => canonicalUrl(item.url) === target)) {
    await setBadge("✓", "#16803c", "ReSync: already saved", tabId);
  } else {
    await setBadge("", "#555555", "Capture in ReSync", tabId);
  }
}

async function showFeedbackNotification(feedback) {
  if (!chrome.notifications?.create) return;
  await chrome.notifications.create(`resync-${feedback.captureId}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: feedback.ok ? "Saved to ReSync" : "ReSync capture needs attention",
    message: feedback.message,
  });
}

async function notifyOpenReSyncTabs(item, message) {
  if (
    !item ||
    typeof chrome.tabs.query !== "function" ||
    typeof chrome.tabs.sendMessage !== "function"
  ) {
    return;
  }
  const tabs = await chrome.tabs
    .query({ url: `${RESYNC_URL}/*` })
    .catch(() => []);
  await Promise.all(
    tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id, {
            type: "resync-item-captured",
            item,
            message,
          })
          .catch(() => undefined),
      ),
  );
}

async function finishCapture(message, sender = {}) {
  const queue = await readQueue();
  const completed = queue.find((item) => item.captureId === message.captureId);
  const remaining = message.ok
    ? queue.filter((item) => item.captureId !== message.captureId)
    : queue;
  await writeQueue(remaining);
  await syncRetryAlarm(remaining);
  const feedback = {
    captureId: message.captureId,
    ok: Boolean(message.ok),
    message: message.message || (message.ok ? "Saved to ReSync Inbox." : "Capture failed."),
    completedAt: Date.now(),
  };
  await chrome.storage.local.set({ captureFeedback: feedback });
  if (message.ok && completed) await recordHistory(completed);
  await setBadge(
    message.ok ? "✓" : "!",
    message.ok ? "#16803c" : "#c62828",
    message.ok ? "ReSync: saved to Inbox" : `ReSync: ${feedback.message}`,
    completed?.sourceTabId,
  );
  await showFeedbackNotification(feedback).catch(() => {});
  if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id).catch(() => {});
  return remaining;
}

async function tryDirectCapture(capture) {
  if (typeof fetch !== "function") return false;
  try {
    const response = await fetch(`${RESYNC_URL}/api/capture`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capture),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) return false;
    const result = await response.json();
    if (!result?.item) return false;
    await notifyOpenReSyncTabs(result.item, result.message);
    await finishCapture({
      type: "resync-capture-result",
      captureId: capture.captureId,
      ok: true,
      message: result.message,
    });
    return true;
  } catch {
    return false;
  }
}

async function openDeliveryTab(capture) {
  await chrome.tabs.create({
    url: `${RESYNC_URL}/?capture=extension&captureId=${encodeURIComponent(capture.captureId)}`,
    active: false,
  });
}

async function deliverQueue() {
  if (deliveryRunning || currentDeliveryId) return;
  deliveryRunning = true;
  try {
    const queue = await readQueue();
    const capture = queue[0];
    if (!capture) return;
    currentDeliveryId = capture.captureId;
    if (await tryDirectCapture(capture)) {
      currentDeliveryId = null;
      deliveryRunning = false;
      await deliverQueue();
      return;
    }
    await openDeliveryTab(capture);
  } finally {
    deliveryRunning = false;
  }
}

async function enqueueCapture(capture, sourceTabId) {
  if (!capture || typeof capture.url !== "string") throw new Error("The page capture is invalid.");
  const target = canonicalUrl(capture.url);
  const queue = await readQueue();
  const existing = queue.find((item) => canonicalUrl(item.url) === target);
  if (existing) return existing;
  const pending = {
    ...capture,
    url: target,
    captureId: crypto.randomUUID(),
    capturedAt: Date.now(),
    attempts: 0,
    sourceTabId: Number.isInteger(sourceTabId) ? sourceTabId : undefined,
  };
  queue.push(pending);
  await writeQueue(queue);
  await syncRetryAlarm(queue);
  await chrome.storage.local.remove("captureFeedback");
  await setBadge("…", "#555555", "ReSync: sending capture…", pending.sourceTabId);
  void deliverQueue();
  return pending;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "resync-enqueue-capture") {
    void withQueueLock(() => enqueueCapture(message.capture, message.sourceTabId))
      .then((capture) => sendResponse({ ok: true, captureId: capture.captureId }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Capture queue failed." }));
    return true;
  }
  if (message?.type === "resync-get-state") {
    void chrome.storage.local.get(["pendingCaptures", "captureHistory", "captureFeedback"])
      .then(sendResponse);
    return true;
  }
  if (message?.type !== "resync-capture-result") return;
  void withQueueLock(async () => {
    const remaining = await finishCapture(message, sender);
    if (currentDeliveryId === message.captureId) currentDeliveryId = null;
    if (message.ok && remaining.length) void deliverQueue();
  }).then(() => sendResponse({ ok: true }));
  return true;
});

async function resumePendingCaptures() {
  const queue = await readQueue();
  await writeQueue(queue);
  await syncRetryAlarm(queue);
  await deliverQueue();
}

chrome.runtime.onInstalled.addListener(() => void withQueueLock(resumePendingCaptures));
chrome.runtime.onStartup.addListener(() => void withQueueLock(resumePendingCaptures));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void withQueueLock(resumePendingCaptures);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void restoreBadgeForTab(tabId, changeInfo.url || tab?.url);
  }
});
if (chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url) await restoreBadgeForTab(tabId, tab.url);
  });
}
