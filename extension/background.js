const RESYNC_URL = "https://resync.mtbishmam.chatgpt.site";
const RETRY_ALARM = "resync-capture-retry";
const RETRY_DELAY_MINUTES = 2;
let queueOperation = Promise.resolve();

function withQueueLock(operation) {
  const nextOperation = queueOperation.then(operation, operation);
  queueOperation = nextOperation.catch(() => {});
  return nextOperation;
}

async function setBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

async function readQueue() {
  const { pendingCaptures, pendingCapture } = await chrome.storage.local.get([
    "pendingCaptures",
    "pendingCapture",
  ]);
  const queue = Array.isArray(pendingCaptures)
    ? pendingCaptures.filter(
        (capture) =>
          capture &&
          typeof capture.captureId === "string" &&
          typeof capture.url === "string",
      )
    : [];
  if (
    pendingCapture &&
    typeof pendingCapture.captureId === "string" &&
    !queue.some((capture) => capture.captureId === pendingCapture.captureId)
  ) {
    queue.push(pendingCapture);
  }
  return queue;
}

async function writeQueue(queue) {
  await chrome.storage.local.set({ pendingCaptures: queue });
  await chrome.storage.local.remove("pendingCapture");
}

async function syncRetryAlarm(queue) {
  if (queue.length > 0) {
    await chrome.alarms.create(RETRY_ALARM, {
      delayInMinutes: RETRY_DELAY_MINUTES,
    });
    return;
  }
  await chrome.alarms.clear(RETRY_ALARM);
}

async function openDeliveryTab(captureId) {
  const queue = await readQueue();
  const index = queue.findIndex((capture) => capture.captureId === captureId);
  if (index < 0) return;
  queue[index] = {
    ...queue[index],
    attempts: (queue[index].attempts ?? 0) + 1,
    lastAttemptAt: Date.now(),
  };
  await writeQueue(queue);
  await chrome.tabs.create({
    url: `${RESYNC_URL}/?capture=extension&captureId=${encodeURIComponent(captureId)}`,
    active: false,
  });
}

async function enqueueCapture(capture) {
  if (!capture || typeof capture.url !== "string") {
    throw new Error("The page capture is invalid.");
  }
  const pendingCapture = {
    ...capture,
    captureId: crypto.randomUUID(),
    capturedAt: Date.now(),
    attempts: 0,
  };
  const queue = await readQueue();
  queue.push(pendingCapture);
  await writeQueue(queue);
  await syncRetryAlarm(queue);
  await chrome.storage.local.remove("captureFeedback");
  await setBadge("…", "#555555");

  // Retry older unsent captures whenever the user makes a new capture. Each
  // payload keeps its own ID, so completing one can never erase another.
  for (const queued of queue) {
    if (
      queued.captureId === pendingCapture.captureId ||
      !queued.lastAttemptAt ||
      Date.now() - queued.lastAttemptAt > 60_000
    ) {
      await openDeliveryTab(queued.captureId);
    }
  }
  return pendingCapture;
}

async function finishCapture(message, sender) {
  const queue = await readQueue();
  const remaining = message.ok
    ? queue.filter((capture) => capture.captureId !== message.captureId)
    : queue;
  await writeQueue(remaining);
  await syncRetryAlarm(remaining);
  const feedback = {
    captureId: message.captureId,
    ok: Boolean(message.ok),
    message:
      message.message ||
      (message.ok ? "Saved to ReSync Inbox." : "Capture failed."),
    completedAt: Date.now(),
  };
  await chrome.storage.local.set({ captureFeedback: feedback });
  if (!feedback.ok) {
    await setBadge("!", "#c62828");
  } else if (remaining.length > 0) {
    await setBadge("…", "#555555");
  } else {
    await setBadge("✓", "#16803c");
  }

  if (sender.tab?.id) {
    await chrome.tabs.remove(sender.tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "resync-enqueue-capture") {
    void withQueueLock(() => enqueueCapture(message.capture))
      .then((capture) =>
        sendResponse({ ok: true, captureId: capture.captureId }),
      )
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Capture queue failed.",
        }),
      );
    return true;
  }

  if (message?.type === "resync-capture-started") {
    void chrome.storage.local.remove("captureFeedback");
    void setBadge("…", "#555555");
    return;
  }

  if (message?.type !== "resync-capture-result") return;
  void withQueueLock(() => finishCapture(message, sender))
    .then(() => sendResponse({ ok: true }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Capture acknowledgement failed.",
      }),
    );
  return true;
});

async function resumePendingCaptures() {
  const queue = await readQueue();
  await writeQueue(queue);
  for (const capture of queue) {
    if (!capture.lastAttemptAt || Date.now() - capture.lastAttemptAt > 60_000) {
      await openDeliveryTab(capture.captureId);
    }
  }
  await syncRetryAlarm(queue);
}

chrome.runtime.onInstalled.addListener(() =>
  void withQueueLock(resumePendingCaptures),
);
chrome.runtime.onStartup.addListener(() =>
  void withQueueLock(resumePendingCaptures),
);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) {
    void withQueueLock(resumePendingCaptures);
  }
});
