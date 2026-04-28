// Claude Reading-Place Bookmarks
// Watches for clicks on Claude's "reply to selection" affordance, captures
// where you were reading (anchor A) and links it to your sent user turn
// (anchor B) when the message goes out. Sidebar offers click-to-jump back.

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────
  // SELECTORS — claude.ai DOM is not a stable contract.
  // Update these constants when the site changes. Inspect the page
  // (right-click → Inspect) on the actual elements to find the right
  // attributes. The matching is tolerant: each constant accepts a list
  // of selectors, the first one that matches wins.
  // ────────────────────────────────────────────────────────────────────

  const SEL = {
    // The floating "Reply" button that appears when you select text inside
    // an assistant message. data-selection-tooltip is the current stable
    // hook (2025+); aria-label fallbacks for future changes.
    REPLY_BUTTON: [
      '[data-selection-tooltip="true"] button',
      'button[aria-label*="Reply" i]',
      'button[data-testid*="reply" i]',
    ],

    // A single assistant turn. Used to figure out which assistant message
    // contains the selected text when you click reply.
    // [data-test-render-count] is the current claude.ai container (2025+).
    ASSISTANT_TURN: [
      '[data-test-render-count]',
      '[data-testid*="assistant-message" i]',
      '[data-testid*="assistant-turn" i]',
      '[data-message-author-role="assistant"]',
    ],
  };

  // ────────────────────────────────────────────────────────────────────
  // BOOKMARK STATE
  // ────────────────────────────────────────────────────────────────────

  const MAX_BOOKMARKS = 10;
  const TITLE_LENGTH = 60;

  // bookmarks: array of { id, title, anchorA, anchorB }
  // anchorA: { element, range } - where the highlight was when you clicked reply
  // anchorB: element of your user turn, or null if not yet sent
  const bookmarks = [];
  let nextId = 1;

  // ────────────────────────────────────────────────────────────────────
  // CAPTURING ANCHOR A: highlight position at moment of reply-click
  // ────────────────────────────────────────────────────────────────────

  let lastSelection = null;

  // The Claude reply button steals selection focus when clicked, so we
  // snapshot the selection on every selectionchange instead of trying to
  // read it inside the click handler.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    // Only care about selections inside an assistant message.
    const assistantTurn = closestMatching(range.startContainer, SEL.ASSISTANT_TURN);
    if (!assistantTurn) return;

    lastSelection = {
      text,
      range: range.cloneRange(),
      assistantTurn,
      timestamp: Date.now(),
    };
  });

  function closestMatching(node, selectorList) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el) {
      for (const sel of selectorList) {
        if (el.matches && el.matches(sel)) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // Catch reply-button clicks anywhere on the page (event delegation, so
  // we don't have to re-bind when buttons appear/disappear).
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || !(target instanceof Element)) return;

    const button = target.closest('button');
    if (!button) return;

    const isReplyButton = SEL.REPLY_BUTTON.some(sel => {
      try { return button.matches(sel); } catch { return false; }
    });
    if (!isReplyButton) return;

    // We have a reply click. Use the most recent selection if it's fresh
    // (within last 5 seconds — guards against stale captures).
    if (!lastSelection || Date.now() - lastSelection.timestamp > 5000) return;

    createBookmark(lastSelection);
  }, true); // capture phase, so we run before Claude's own handler

  function findScrollContainer(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const ov = window.getComputedStyle(node).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.documentElement;
  }

  function createBookmark(selection) {
    const title = selection.text.length > TITLE_LENGTH
      ? selection.text.slice(0, TITLE_LENGTH).trimEnd() + '…'
      : selection.text;

    // Capture scroll container and target position while element is live in the DOM.
    // Compute the scrollTop that puts the bottom of the assistant turn at the
    // bottom of the container viewport — that's "right above the input."
    const el = selection.assistantTurn;
    const container = findScrollContainer(el);
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const elBottomInContent = elRect.bottom - cRect.top + container.scrollTop;
    const scrollB = Math.max(0, elBottomInContent - container.clientHeight);
    const bookmark = {
      id: nextId++,
      title,
      anchorA: {
        element: el,
        range: selection.range,
      },
      scrollContainer: container,
      scrollB,
    };

    bookmarks.unshift(bookmark);
    pendingBookmarks.push(bookmark);

    // FIFO eviction
    while (bookmarks.length > MAX_BOOKMARKS) {
      bookmarks.pop();
    }

    renderSidebar();
  }

  // ────────────────────────────────────────────────────────────────────
  // ANCHOR B: link sent user-turn to pending bookmarks
  // ────────────────────────────────────────────────────────────────────

  const pendingBookmarks = [];

  function onNewUserTurn(el) {
    if (!pendingBookmarks.length) return;
    for (const bm of pendingBookmarks) bm.anchorB = el;
    pendingBookmarks.length = 0;
    renderSidebar();
  }

  function startObserver() {
    const container = document.querySelector('[data-testid="user-message"]')
      ?.closest('[class*="overflow"]') || document.documentElement;
    const root = container === document.documentElement ? document.body : container.parentElement || document.body;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches('[data-testid="user-message"]')) { onNewUserTurn(node); return; }
          const nested = node.querySelector('[data-testid="user-message"]');
          if (nested) { onNewUserTurn(nested); return; }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ────────────────────────────────────────────────────────────────────
  // SIDEBAR UI
  // ────────────────────────────────────────────────────────────────────

  let sidebarRoot = null;
  let collapsed = false;

  function ensureSidebar() {
    if (sidebarRoot && document.body.contains(sidebarRoot)) return;
    sidebarRoot = document.createElement('div');
    sidebarRoot.id = 'crpb-sidebar';
    sidebarRoot.innerHTML = `
      <div class="crpb-header">
        <span class="crpb-title">Reply trail</span>
        <button class="crpb-toggle" aria-label="Collapse"></button>
      </div>
      <ul class="crpb-list" role="list"></ul>
      <div class="crpb-empty">No bookmarks yet. Highlight text in a reply and click Reply.</div>
    `;
    document.body.appendChild(sidebarRoot);

    sidebarRoot.querySelector('.crpb-toggle').addEventListener('click', () => {
      collapsed = !collapsed;
      sidebarRoot.classList.toggle('crpb-collapsed', collapsed);
    });
  }

  function renderSidebar() {
    ensureSidebar();
    const list = sidebarRoot.querySelector('.crpb-list');
    const empty = sidebarRoot.querySelector('.crpb-empty');
    list.innerHTML = '';

    if (bookmarks.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    for (const bm of bookmarks) {
      const li = document.createElement('li');
      li.className = 'crpb-item';

      const titleBtn = document.createElement('button');
      titleBtn.className = 'crpb-title-btn';
      titleBtn.textContent = bm.title;
      titleBtn.title = 'Jump to where you were reading';
      titleBtn.addEventListener('click', () => jumpToA(bm));

      const bBtn = document.createElement('button');
      bBtn.className = 'crpb-b-btn';
      bBtn.setAttribute('aria-label', 'Jump to end of this assistant response');
      bBtn.title = 'Jump to end of this assistant response';
      bBtn.textContent = '↓';
      bBtn.addEventListener('click', () => jumpToB(bm));

      const removeBtn = document.createElement('button');
      removeBtn.className = 'crpb-remove-btn';
      removeBtn.setAttribute('aria-label', 'Remove bookmark');
      removeBtn.title = 'Remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        const idx = bookmarks.indexOf(bm);
        if (idx !== -1) bookmarks.splice(idx, 1);
        renderSidebar();
      });

      li.appendChild(titleBtn);
      li.appendChild(bBtn);
      li.appendChild(removeBtn);
      list.appendChild(li);
    }
  }

  function jumpToA(bm) {
    const range = bm.anchorA.range;
    let target;
    try {
      // Scroll to the specific paragraph containing the selection,
      // not just the start of the whole assistant turn.
      const startNode = range.startContainer;
      const el = startNode.nodeType === Node.TEXT_NODE
        ? startNode.parentElement
        : startNode;
      target = (el && document.body.contains(el)) ? el : bm.anchorA.element;
    } catch {
      target = bm.anchorA.element;
    }
    if (!target || !document.body.contains(target)) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => flashRange(bm.anchorA.range), 300);
  }

  function jumpToB(bm) {
    // Prefer scrolling to the sent user-turn (excerpt chip + typed reply).
    // Fall back to the snapshotted bottom-of-assistant-turn position.
    if (bm.anchorB && document.body.contains(bm.anchorB)) {
      bm.anchorB.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const c = bm.scrollContainer;
    if (c && document.body.contains(c)) c.scrollTo({ top: bm.scrollB, behavior: 'smooth' });
  }

  function flashRange(range) {
    try {
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const flash = document.createElement('div');
      flash.className = 'crpb-flash';
      flash.style.left = (rect.left + window.scrollX) + 'px';
      flash.style.top = (rect.top + window.scrollY) + 'px';
      flash.style.width = rect.width + 'px';
      flash.style.height = rect.height + 'px';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 1200);
    } catch {
      // Range may have been invalidated by DOM changes; silent failure.
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // BOOT
  // ────────────────────────────────────────────────────────────────────

  function boot() {
    ensureSidebar();
    renderSidebar();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
