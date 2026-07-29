const statusElement = document.querySelector("#status");
const captureButton = document.querySelector("#capture");
const manualTranscript = document.querySelector("#manualTranscript");
const sendManualButton = document.querySelector("#sendManual");
const RESYNC_HOST = "resync.mtbishmam.chatgpt.site";

let lastCapture = null;
let activeCaptureId = null;
let sourceTabId = null;

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

function isReSync(url) {
  try {
    return new URL(url).hostname.toLowerCase() === RESYNC_HOST;
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
      document.querySelectorAll(
        "ytd-transcript-segment-renderer, transcript-segment-view-model",
      ),
    );
    return segments
      .map((segment) => {
        const timestamp =
          segment
            .querySelector(
              ".segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp",
            )
            ?.textContent?.trim() ?? "";
        const text =
          segment
            .querySelector(
              ".segment-text, .ytAttributedStringHost[role='text']",
            )
            ?.textContent?.trim() ?? "";
        return text ? `${timestamp} ${text}`.trim() : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  async function tryOpenTranscript() {
    const isVisible = (element) =>
      element instanceof HTMLElement &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden";

    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const htmlScrollBehavior = document.documentElement.style.scrollBehavior;
    const bodyScrollBehavior = document.body.style.scrollBehavior;
    document.documentElement.style.setProperty(
      "scroll-behavior",
      "auto",
      "important",
    );
    document.body.style.setProperty("scroll-behavior", "auto", "important");
    const holdViewport = () => {
      if (window.scrollX !== originalX || window.scrollY !== originalY) {
        window.scrollTo(originalX, originalY);
      }
    };
    window.addEventListener("scroll", holdViewport, { passive: true });
    const holdTimer = window.setInterval(holdViewport, 40);

    try {
      const expand = Array.from(
        document.querySelectorAll(
          "ytd-text-inline-expander #expand, #description-inline-expander #expand",
        ),
      ).find(isVisible);
      expand?.click();

      let transcriptControl = null;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        transcriptControl = Array.from(
          document.querySelectorAll("button, [role='button']"),
        ).find(
          (element) =>
            isVisible(element) &&
            /show transcript/i.test(
              `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`,
            ),
        );
        if (transcriptControl) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      transcriptControl?.click();

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const text = transcriptText();
        if (text.length >= 40) return text;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return "";
    } finally {
      window.clearInterval(holdTimer);
      window.removeEventListener("scroll", holdViewport);
      document.documentElement.style.scrollBehavior = htmlScrollBehavior;
      document.body.style.scrollBehavior = bodyScrollBehavior;
      window.scrollTo(originalX, originalY);
    }
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
  const result = await chrome.runtime.sendMessage({
    type: "resync-enqueue-capture",
    capture,
    sourceTabId,
  });
  if (!result?.ok || !result.captureId) {
    throw new Error(result?.error || "ReSync could not queue this capture.");
  }
  activeCaptureId = result.captureId;
  statusElement.textContent =
    "Queued safely. Sending in the background…";
}

async function capture() {
  captureButton.hidden = true;
  captureButton.disabled = true;
  statusElement.textContent = "Reading this page…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) {
      throw new Error("Open a YouTube video or article first.");
    }
    sourceTabId = tab.id;
    if (isReSync(tab.url)) {
      throw new Error(
        "ReSync is already open. Capture a YouTube video or article tab instead.",
      );
    }
    let result;
    try {
      [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: captureVisiblePage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cannot access|permission|host/i.test(message)) {
        throw new Error(
          "ReSync needs access to YouTube. Reload version 0.3.1 and allow its YouTube permission.",
        );
      }
      throw error;
    }
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
    captureButton.hidden = false;
  } finally {
    captureButton.disabled = false;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  const feedback = changes.captureFeedback?.newValue;
  if (
    areaName !== "local" ||
    !feedback ||
    (activeCaptureId && feedback.captureId !== activeCaptureId)
  ) {
    return;
  }
  statusElement.textContent = feedback.ok
    ? `✓ ${feedback.message || "Saved to ReSync Inbox."}`
    : `Could not save: ${feedback.message || "Capture failed."}`;
  captureButton.hidden = feedback.ok;
});

captureButton.addEventListener("click", () => void capture());
sendManualButton.addEventListener("click", () => {
  const content = manualTranscript.value.trim();
  if (!lastCapture || content.length < 40) {
    statusElement.textContent = "Paste the full transcript first.";
    return;
  }
  void sendToReSync({ ...lastCapture, content });
});

void capture();
