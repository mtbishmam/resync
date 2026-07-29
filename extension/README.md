# ReSync Capture extension

This unpacked Chromium extension captures the active page and hands it to the
private ReSync site without exposing a public capture API.

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

Click the pinned icon once while viewing a YouTube video or article. Capture
starts immediately, ReSync saves through a background tab, and the toolbar
badge shows a green check on success or a red exclamation mark on failure.

Version 0.2.2 keeps a separate persistent queue entry for every capture. Rapid
captures cannot overwrite each other, successful acknowledgements remove only
their matching entry, and unconfirmed captures remain queued for automatic
retry. YouTube transcript capture holds the current viewport in place, and a
system notification plus the toolbar badge confirms the final result.
