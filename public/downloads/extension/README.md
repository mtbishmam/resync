# ReSync Capture extension

This unpacked Chromium extension captures pages into the private ReSync site.

- YouTube: opens/reads YouTube's visible transcript panel when possible. If it
  cannot read the transcript, the popup asks for a manual paste.
- Other HTTP(S) pages: treats the page as an article and extracts readable text
  from `article`, `main`, or the document body.
- ReSync: stores the captured text immediately, waits for the cooldown, then
  runs the existing GPT-5.4 mini analysis.

## Install in Brave

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension` folder.
4. Allow the requested YouTube site access.
5. Pin **ReSync Capture**.

Open the pinned extension and choose **Send current tab**, or paste multiple
links into the bulk box. The toolbar badge shows a green check on success or a
red exclamation mark when the persistent retry queue needs attention.

Version 0.4.0 sends directly to ReSync when the signed-in browser session allows
it, with one serialized background-tab fallback. It keeps separate queue IDs,
deduplicates pending URLs, retries unconfirmed captures, and stores recent save
history so the green tick survives refreshes and browser restarts. ReSync itself
is excluded from capture.
