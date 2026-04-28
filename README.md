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

## How it works

- **Select text** inside any assistant message, then click the floating
  **Reply** button that appears.
- A bookmark entry is added to the sidebar immediately. The bookmark title
  is the selected text (truncated to 60 characters).
- **Click the title** to scroll back to the exact paragraph you were reading.
  The text flashes yellow briefly so you can spot it.
- **Click `↓`** to jump forward to the user turn you sent (the excerpt chip
  plus your typed reply). If the sent turn isn't available yet (e.g., the
  reply hasn't been submitted), the button falls back to scrolling to the
  bottom of the assistant message you were reading.

## Updating the selectors when claude.ai changes

The DOM at claude.ai is not a stable contract. When the site ships a UI
update, one or more of the selectors in `content.js` may stop matching.
The sidebar will appear but won't capture clicks or won't link reply turns.

To repair:

1. Open a claude.ai chat with the extension loaded.
2. Right-click the element that broke (the reply button or an assistant
   message) and choose Inspect.
3. Find a stable-looking attribute on the element — `aria-label`, a
   `data-testid`, or a distinctive class fragment.
4. Open `content.js` and update the corresponding entry in the `SEL` object
   at the top of the file. Each entry is a list of selectors; the first
   one that matches is used, so you can leave older patterns in place as
   fallbacks.
5. Reload the extension in `chrome://extensions` (the refresh icon on the
   extension's card), then reload the claude.ai tab.

The two selectors that matter:

- `REPLY_BUTTON` — the floating "Reply" button that appears when you've
  selected text inside an assistant message. The current stable hook is the
  parent container `[data-selection-tooltip="true"]`; we select the `button`
  inside it.
- `ASSISTANT_TURN` — a single assistant message container. Used to identify
  which turn contained the highlight and to compute the scroll target.
  Current hook: `[data-test-render-count]`.

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
