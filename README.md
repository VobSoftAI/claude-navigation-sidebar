# Browser Chatbot Bookmark Sidebar

A Chrome extension that adds a bookmark sidebar to **claude.ai** and **gemini.google.com**. Select text in any AI response to bookmark your reading position, jump back to it instantly, or dispatch it to a second tab for lookup — all without leaving your conversation.

**No server. No account. No setup beyond loading the extension.**

---

## Features

### Bookmarks
Select text in any assistant response and create a bookmark entry in the sidebar. Click it later to scroll straight back to that paragraph (with a brief yellow flash so you can spot it).

Two bookmark types, shown with a small icon:
- **◈** Position bookmark — just marks where you were reading
- **↩** Reply bookmark — marks position and queues the text in the input box

### On claude.ai
When you select text, a floating row appears next to Claude's native Reply button:
- **Bookmark** — records position only, no input touch
- **Explain / Define / Search** — sends selected text to a registered sidecar tab (see below)

Clicking Claude's own **Reply** button also creates a reply bookmark.

### On Gemini
When you select text, a floating **[Bookmark] [Reply]** row appears:
- **Bookmark** — records position
- **Reply** — records position and fills the Gemini input with the selected text (doesn't auto-submit)

The **Explain / Define / Search** sidecar buttons also appear on Gemini.

### Sidecar lookup
Any tab can become a **receiver**: click the **⊕** toggle in the sidebar header. When you select text in any other tab and click Explain, Define, or Search, the prefixed prompt is injected into the receiver tab's input and submitted automatically — without you leaving your current conversation.

The receiver toggle disappears when the sidebar is collapsed so it doesn't block the expand handle.

---

## Install

1. Open `chrome://extensions` in Chrome (or Edge / Brave equivalent).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this directory.
4. Open or reload a claude.ai or Gemini tab. The sidebar appears on the right edge.

---

## Sidebar controls

| Control | Action |
|---|---|
| Click bookmark title | Scroll back to reading position (flashes yellow) |
| **↓** button (Claude only) | Jump to the reply you sent after this bookmark |
| **×** button | Remove bookmark |
| **⊕** toggle | Register/unregister this tab as a sidecar receiver |
| **×** header button | Clear all bookmarks |
| Collapse arrow | Minimize sidebar to a thin strip |

---

## Limitations

- Bookmarks live in memory only — lost on page reload or tab close.
- DOM selectors for claude.ai and Gemini are not a stable API. If the site redesigns, bookmarks may stop capturing until the selectors are updated.
- The 5-second selection guard means: if you select text, wait more than 5 seconds, then click Bookmark or Reply, the bookmark won't be created.
- Sidecar receivers are cleared when the browser session ends (uses `chrome.storage.session`).

## If it breaks

Please [open an issue](https://github.com/VobSoftAI/browser-chatbot-bookmark-sidebar/issues) and include the date — DOM breakage correlates with site deploys.
