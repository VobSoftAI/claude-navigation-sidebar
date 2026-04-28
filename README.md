# Claude Navigation Sidebar

A small Chrome extension for claude.ai. When you select text in an assistant
response and click Claude's Reply button, this extension adds an entry to a
sidebar with the highlight as its title. Clicking the entry later scrolls
you back to where you were reading (with a brief yellow flash highlight).
A small `↓` button on each entry jumps forward to your sent reply in the
transcript.

The sidebar holds the 10 most recent bookmarks. No persistence across page
reloads — these are short-term breadcrumbs for the current reading session,
not a saved index.

## Install

1. Open `chrome://extensions` in Chrome (or the Edge/Brave equivalent).
2. Toggle "Developer mode" on (top right).
3. Click "Load unpacked" and select this directory.
4. Open or reload a claude.ai chat. The sidebar appears on the right edge.

Works on both **claude.ai** and **gemini.google.com**.

## How it works

**On claude.ai:** Select text inside any assistant message, then click the
floating **Reply** button that appears.

**On Gemini:** Select text inside any model response. A small **Bookmark**
button appears just above the selection — click it to add the entry.

For both sites:
- A bookmark entry is added to the sidebar immediately. The bookmark title
  is the selected text (truncated to 60 characters).
- **Click the title** to scroll back to the exact paragraph you were reading.
  The text flashes yellow briefly so you can spot it.
- **Click `↓`** to jump forward to the user turn you sent (the excerpt chip
  plus your typed reply). If the sent turn isn't available yet (e.g., the
  reply hasn't been submitted), the button falls back to scrolling to the
  bottom of the assistant message you were reading.
- **Click `×`** on any entry to remove it from the sidebar.

## If it stops working

The DOM at claude.ai is not a stable contract. When the site ships a UI
update, the extension may stop capturing bookmarks or linking reply turns.

If that happens, please [open an issue](https://github.com/VobSoftAI/claude-navigation-sidebar/issues)
and describe what's broken. Include the date so it can be correlated with
a claude.ai deploy.

## Known limitations

- Bookmarks persist in memory only; they're lost on page reload or tab close.
- Anchor A is captured as a DOM Range. If claude.ai re-renders the assistant
  message (rare for completed turns, common while streaming), the range may
  become invalid and the flash won't appear — but scrolling to the assistant
  turn still works.
- The "fresh selection" guard discards selections older than 5 seconds at
  the moment of the reply click. If you select text, wait a long time, then
  click Reply, the bookmark won't be created.
- The `↓` button lands a few lines above the input box rather than exactly
  at it, depending on viewport size and message layout.
- No keyboard shortcut. Click only.
