async function deliverPendingCapture() {
  const captureId = new URL(location.href).searchParams.get("captureId");
  const { pendingCaptures, pendingCapture: legacyCapture } =
    await chrome.storage.local.get(["pendingCaptures", "pendingCapture"]);
  const queue = Array.isArray(pendingCaptures) ? pendingCaptures : [];
  const pendingCapture =
    queue.find((capture) => capture.captureId === captureId) ??
    (legacyCapture?.captureId === captureId ? legacyCapture : null) ??
    (!captureId ? queue[0] ?? legacyCapture : null);
  if (!pendingCapture) return;

  let finished = false;
  const onAck = async (event) => {
    if (
      event.source !== window ||
      event.data?.type !== "resync-extension-ack" ||
      event.data?.captureId !== pendingCapture.captureId
    ) {
      return;
    }
    finished = true;
    window.removeEventListener("message", onAck);
    window.clearInterval(retryTimer);
    window.clearTimeout(retryTimeout);
    await chrome.runtime.sendMessage({
      type: "resync-capture-result",
      captureId: pendingCapture.captureId,
      ok: Boolean(event.data.ok),
      message: event.data.message,
    });
  };

  window.addEventListener("message", onAck);
  const postCapture = () =>
    window.postMessage(
      {
        type: "resync-extension-capture",
        payload: pendingCapture,
      },
      "*",
    );
  postCapture();
  const retryTimer = window.setInterval(postCapture, 1000);
  const retryTimeout = window.setTimeout(() => {
    if (finished) return;
    window.clearInterval(retryTimer);
    window.removeEventListener("message", onAck);
    void chrome.runtime.sendMessage({
      type: "resync-capture-result",
      captureId: pendingCapture.captureId,
      ok: false,
      message: "ReSync did not confirm the save. Try again.",
    });
  }, 60000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "resync-item-captured" || !message.item) return;
  window.postMessage(
    {
      type: "resync-item-captured",
      item: message.item,
      message: message.message,
    },
    "*",
  );
  sendResponse({ ok: true });
});

void deliverPendingCapture();
