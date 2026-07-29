const RESYNC_URL = "https://resync.mtbishmam.chatgpt.site";

const statusElement = document.querySelector("#status");
const captureButton = document.querySelector("#capture");
const manualTranscript = document.querySelector("#manualTranscript");
const sendManualButton = document.querySelector("#sendManual");

let lastCapture = null;

function isYouTube(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

async function captureVisiblePage() {
  const youtube = /(^|\.)youtube\.com$|^youtu\.be$/.test(
    location.hostname.replace(/^www\./, "").toLowerCase(),
  );

  function transcriptText() {
    const segments = Array.from(
      document.querySelectorAll("ytd-transcript-segment-renderer"),
    );
    return segments
      .map((segment) => {
        const timestamp =
          segment.querySelector(".segment-timestamp")?.textContent?.trim() ?? "";
        const text =
          segment.querySelector(".segment-text")?.textContent?.trim() ?? "";
        return text ? `${timestamp} ${text}`.trim() : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  async function tryOpenTranscript() {
    const expand =
      document.querySelector("ytd-text-inline-expander #expand") ??
      Array.from(document.querySelectorAll("button")).find((button) =>
        /more/i.test(button.textContent ?? ""),
      );
    if (expand instanceof HTMLElement) expand.click();
    await new Promise((resolve) => setTimeout(resolve, 350));

    const transcriptControl = Array.from(
      document.querySelectorAll("button, [role='button'], ytd-button-renderer"),
    ).find((element) =>
      /show transcript|transcript/i.test(
        `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`,
      ),
    );
    if (transcriptControl instanceof HTMLElement) transcriptControl.click();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const text = transcriptText();
      if (text.length >= 40) return text;
    }
    return "";
  }

  if (youtube) {
    const existing = transcriptText();
    return {
      url: location.href,
      title: document.title.replace(/\s*-\s*YouTube\s*$/i, ""),
      author:
        document.querySelector("#owner #channel-name")?.textContent?.trim() ??
        "YouTube",
      content: existing.length >= 40 ? existing : await tryOpenTranscript(),
    };
  }

  const root =
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.querySelector("[role='main']") ??
    document.body;
  const clone = root.cloneNode(true);
  clone
    .querySelectorAll(
      "script, style, noscript, nav, header, footer, aside, form, button, svg",
    )
    .forEach((element) => element.remove());
  const content = clone.innerText
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return {
    url: location.href,
    title: document.title,
    author: location.hostname.replace(/^www\./, ""),
    content,
  };
}

async function sendToReSync(capture) {
  const pendingCapture = {
    ...capture,
    captureId: crypto.randomUUID(),
    capturedAt: Date.now(),
  };
  await chrome.storage.local.set({ pendingCapture });
  await chrome.tabs.create({ url: `${RESYNC_URL}/?capture=extension` });
  statusElement.textContent = "Opening ReSync…";
  window.setTimeout(() => window.close(), 450);
}

async function capture() {
  captureButton.disabled = true;
  statusElement.textContent = "Reading this page…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) {
      throw new Error("Open a YouTube video or article first.");
    }
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureVisiblePage,
    });
    lastCapture = result.result;
    if (!lastCapture?.content || lastCapture.content.length < 40) {
      if (isYouTube(lastCapture?.url ?? tab.url)) {
        manualTranscript.hidden = false;
        sendManualButton.hidden = false;
        statusElement.textContent =
          "YouTube did not expose the transcript. Paste it below.";
        return;
      }
      throw new Error("This page did not expose readable article text.");
    }
    await sendToReSync(lastCapture);
  } catch (error) {
    statusElement.textContent =
      error instanceof Error ? error.message : "Capture failed.";
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener("click", () => void capture());
sendManualButton.addEventListener("click", () => {
  const content = manualTranscript.value.trim();
  if (!lastCapture || content.length < 40) {
    statusElement.textContent = "Paste the full transcript first.";
    return;
  }
  void sendToReSync({ ...lastCapture, content });
});
