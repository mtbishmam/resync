const statusElement = document.querySelector("#status");
const captureButton = document.querySelector("#capture");
const manualTranscript = document.querySelector("#manualTranscript");
const sendManualButton = document.querySelector("#sendManual");
const bulkLinks = document.querySelector("#bulkLinks");
const sendBulkButton = document.querySelector("#sendBulk");
const historyList = document.querySelector("#historyList");
const RESYNC_HOST = "resync.mtbishmam.chatgpt.site";
let lastCapture = null;
let sourceTabId = null;

function isYouTube(url) {
  try { const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com"); } catch { return false; }
}
function isReSync(url) { try { return new URL(url).hostname.toLowerCase() === RESYNC_HOST; } catch { return false; } }

async function captureVisiblePage() {
  const youtube = /(^|\.)youtube\.com$|^youtu\.be$/.test(location.hostname.replace(/^www\./, "").toLowerCase());
  function transcriptText() {
    return Array.from(document.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model"))
      .map((segment) => {
        const time = segment.querySelector(".segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp")?.textContent?.trim() ?? "";
        const text = segment.querySelector(".segment-text, .ytAttributedStringHost[role='text']")?.textContent?.trim() ?? "";
        return text ? `${time} ${text}`.trim() : "";
      }).filter(Boolean).join("\n");
  }
  async function tryOpenTranscript() {
    const visible = (element) => element instanceof HTMLElement && element.getClientRects().length > 0;
    document.querySelector("ytd-text-inline-expander #expand, #description-inline-expander #expand")?.click();
    for (let i = 0; i < 15; i += 1) {
      const control = Array.from(document.querySelectorAll("button, [role='button']")).find((el) => visible(el) && /show transcript/i.test(`${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`));
      if (control) { control.click(); break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (let i = 0; i < 60; i += 1) { const text = transcriptText(); if (text.length >= 40) return text; await new Promise((resolve) => setTimeout(resolve, 100)); }
    return "";
  }
  if (youtube) return { url: location.href, title: document.title.replace(/\s*-\s*YouTube\s*$/i, ""), author: document.querySelector("#owner #channel-name")?.textContent?.trim() ?? "YouTube", content: transcriptText() || await tryOpenTranscript() };
  const root = document.querySelector("article") ?? document.querySelector("main") ?? document.querySelector("[role='main']") ?? document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, noscript, nav, header, footer, aside, form, button, svg").forEach((el) => el.remove());
  return { url: location.href, title: document.title, author: location.hostname.replace(/^www\./, ""), content: clone.innerText.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim() };
}

async function enqueue(capture, tabId = sourceTabId) {
  const result = await chrome.runtime.sendMessage({ type: "resync-enqueue-capture", capture, sourceTabId: tabId });
  if (!result?.ok) throw new Error(result?.error || "ReSync could not queue this capture.");
  return result;
}

async function captureCurrent() {
  captureButton.disabled = true;
  statusElement.textContent = "Reading this page…";
  manualTranscript.hidden = true;
  sendManualButton.hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http") || isReSync(tab.url)) throw new Error("Open a YouTube video or article first.");
    sourceTabId = tab.id;
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureVisiblePage });
    lastCapture = result.result;
    if (!lastCapture?.content || lastCapture.content.length < 40) {
      if (!isYouTube(lastCapture?.url ?? tab.url)) throw new Error("This page did not expose readable article text.");
      manualTranscript.hidden = false;
      sendManualButton.hidden = false;
      statusElement.textContent = "Transcript not exposed. Paste it below, or send the link without it.";
      lastCapture = { ...lastCapture, content: "" };
      return;
    }
    await enqueue(lastCapture, tab.id);
    statusElement.textContent = "Queued safely. You can close this popup.";
  } catch (error) { statusElement.textContent = error instanceof Error ? error.message : "Capture failed."; }
  finally { captureButton.disabled = false; }
}

function validLinks(value) {
  return [...new Set(value.split(/\s+/).map((line) => line.trim()).filter(Boolean).filter((line) => { try { const url = new URL(line); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }))];
}

async function sendBulk() {
  const links = validLinks(bulkLinks.value);
  if (!links.length) { statusElement.textContent = "Paste at least one valid link."; return; }
  sendBulkButton.disabled = true;
  try {
    await Promise.all(links.map((url) => enqueue({ url, title: isYouTube(url) ? "Saved YouTube video" : new URL(url).hostname, author: new URL(url).hostname, content: "" }, undefined)));
    bulkLinks.value = "";
    statusElement.textContent = `${links.length} link${links.length === 1 ? "" : "s"} queued safely.`;
  } catch (error) { statusElement.textContent = error instanceof Error ? error.message : "Bulk capture failed."; }
  finally { sendBulkButton.disabled = false; }
}

async function renderState() {
  const state = await chrome.runtime.sendMessage({ type: "resync-get-state" });
  const history = Array.isArray(state?.captureHistory) ? state.captureHistory.slice(0, 5) : [];
  const pending = Array.isArray(state?.pendingCaptures) ? state.pendingCaptures.length : 0;
  historyList.replaceChildren();
  if (!history.length) historyList.innerHTML = "<small>No saved links yet.</small>";
  for (const item of history) {
    const row = document.createElement("div"); row.className = "history-item";
    const tick = document.createElement("span"); tick.textContent = "✓";
    const title = document.createElement("span"); title.textContent = item.title || item.url;
    row.append(tick, title); historyList.append(row);
  }
  if (pending) statusElement.textContent = `${pending} capture${pending === 1 ? "" : "s"} still queued.`;
}

captureButton.addEventListener("click", () => void captureCurrent());
sendBulkButton.addEventListener("click", () => void sendBulk());
sendManualButton.addEventListener("click", async () => {
  const content = manualTranscript.value.trim();
  if (!lastCapture) return;
  try { await enqueue({ ...lastCapture, content }, sourceTabId); statusElement.textContent = "Queued safely."; manualTranscript.hidden = true; sendManualButton.hidden = true; } catch (error) { statusElement.textContent = error instanceof Error ? error.message : "Capture failed."; }
});
void renderState();
