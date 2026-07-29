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
4. Pin **ReSync Capture**.
