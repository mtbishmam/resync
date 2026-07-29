async function setBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "resync-capture-started") {
    void chrome.storage.local.remove("captureFeedback");
    void setBadge("…", "#555555");
    return;
  }

  if (message?.type !== "resync-capture-result") return;

  const feedback = {
    captureId: message.captureId,
    ok: Boolean(message.ok),
    message:
      message.message ||
      (message.ok ? "Saved to ReSync Inbox." : "Capture failed."),
    completedAt: Date.now(),
  };
  void chrome.storage.local.set({ captureFeedback });
  void setBadge(feedback.ok ? "✓" : "!", feedback.ok ? "#16803c" : "#c62828");

  if (sender.tab?.id) {
    void chrome.tabs.remove(sender.tab.id).catch(() => {});
  }
});
