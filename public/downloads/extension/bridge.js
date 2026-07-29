async function deliverPendingCapture() {
  const { pendingCapture } = await chrome.storage.local.get("pendingCapture");
  if (!pendingCapture) return;

  const onAck = async (event) => {
    if (
      event.source !== window ||
      event.data?.type !== "resync-extension-ack" ||
      event.data?.captureId !== pendingCapture.captureId
    ) {
      return;
    }
    window.removeEventListener("message", onAck);
    window.clearInterval(retryTimer);
    window.clearTimeout(retryTimeout);
    if (event.data.ok) {
      await chrome.storage.local.remove("pendingCapture");
    }
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
    window.clearInterval(retryTimer);
    window.removeEventListener("message", onAck);
    void chrome.runtime.sendMessage({
      type: "resync-capture-result",
      captureId: pendingCapture.captureId,
      ok: false,
      message: "ReSync did not confirm the save. Try again.",
    });
  }, 30000);
}

void deliverPendingCapture();
