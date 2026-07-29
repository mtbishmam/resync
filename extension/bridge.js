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
    if (event.data.ok) {
      await chrome.storage.local.remove("pendingCapture");
    }
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
  window.setTimeout(() => {
    window.clearInterval(retryTimer);
    window.removeEventListener("message", onAck);
  }, 30000);
}

void deliverPendingCapture();
