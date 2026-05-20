// Claude Navigation Sidebar
// Watches for bookmark triggers on claude.ai (Reply button) and gemini.google.com
// (injected floating button), captures reading position (anchor A) and the sent
// user turn (anchor B). Sidebar offers click-to-jump back.

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────
  // SITE DETECTION
  // ────────────────────────────────────────────────────────────────────

  const SITE = location.hostname.includes('gemini.google.com') ? 'gemini' : 'claude';

  // ────────────────────────────────────────────────────────────────────
  // SELECTORS — per-site, not a stable contract.
  // Each value is a list; the first selector that matches wins.
  // Update when the host site changes its DOM.
  // ────────────────────────────────────────────────────────────────────

  const SITE_SEL = {
    claude: {
      // The floating "Reply" button that appears when you select text inside
      // an assistant message.
      REPLY_BUTTON: [
        '[data-selection-tooltip="true"] button',
        'button[aria-label*="Reply" i]',
        'button[data-testid*="reply" i]',
      ],
      // A single assistant turn container.
      ASSISTANT_TURN: [
        '[data-test-render-count]',
        '[data-testid*="assistant-message" i]',
        '[data-testid*="assistant-turn" i]',
        '[data-message-author-role="assistant"]',
      ],
      USER_MESSAGE: ['[data-testid="user-message"]'],
    },
    gemini: {
      // model-response is Gemini's custom element for assistant turns.
      // May be inside a shadow root — see selectionchange handler below.
      ASSISTANT_TURN: ['model-response'],
      USER_MESSAGE: ['user-query'],
    },
  };

  const SEL = SITE_SEL[SITE];

  // ────────────────────────────────────────────────────────────────────
  // BOOKMARK STATE
  // ────────────────────────────────────────────────────────────────────

  const MAX_BOOKMARKS = 10;
  const TITLE_LENGTH = 60;

  // { id, title, anchorA: { element, range }, anchorB, scrollContainer, scrollB }
  const bookmarks = [];
  let nextId = 1;

  // ────────────────────────────────────────────────────────────────────
  // CAPTURING ANCHOR A
  // ────────────────────────────────────────────────────────────────────

  let lastSelection = null;

  // Snapshot selection on every change so it's available when the trigger fires.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (SITE === 'gemini') hideFloatBtn();
      hideSidecarBtns();
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);

    if (SITE === 'claude') {
      // Only bookmark selections inside a known assistant turn.
      const assistantTurn = closestMatching(range.startContainer, SEL.ASSISTANT_TURN);
      if (!assistantTurn) return;
      lastSelection = { text, range: range.cloneRange(), assistantTurn, timestamp: Date.now() };
      showSidecarBtns(lastSelection.range);
    } else {
      // On Gemini, accept any selection — model-response may sit behind a shadow
      // root and won't be reachable via closestMatching. Fall back to the nearest
      // light-DOM element as the scroll anchor.
      const assistantTurn = closestMatching(range.startContainer, SEL.ASSISTANT_TURN)
        || (range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer);
      lastSelection = { text, range: range.cloneRange(), assistantTurn, timestamp: Date.now() };
      showSidecarBtns(lastSelection.range);
    }
  });

  function closestMatching(node, selectorList) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el) {
      for (const sel of selectorList) {
        try { if (el.matches(sel)) return el; } catch { /* skip invalid selector */ }
      }
      el = el.parentElement;
    }
    return null;
  }

  // ────────────────────────────────────────────────────────────────────
  // CLAUDE: reply-button click trigger
  // ────────────────────────────────────────────────────────────────────

  if (SITE === 'claude') {
    // Capture phase so we run before Claude's own handler (which steals focus).
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !(target instanceof Element)) return;
      const button = target.closest('button');
      if (!button) return;
      const isReplyButton = SEL.REPLY_BUTTON.some(sel => {
        try { return button.matches(sel); } catch { return false; }
      });
      if (!isReplyButton) return;
      if (!lastSelection || Date.now() - lastSelection.timestamp > 5000) return;
      createBookmark(lastSelection, 'reply');
    }, true);
  }

  // ────────────────────────────────────────────────────────────────────
  // GEMINI: injected floating bookmark button
  // ────────────────────────────────────────────────────────────────────

  let floatBtn = null;  // container div holding Bookmark + Reply buttons

  function ensureFloatBtn() {
    if (floatBtn) return floatBtn;
    floatBtn = document.createElement('div');
    floatBtn.className = 'crpb-float-row';

    const bmBtn = document.createElement('button');
    bmBtn.className = 'crpb-float-btn';
    bmBtn.textContent = 'Bookmark';
    bmBtn.setAttribute('aria-label', 'Bookmark this position');
    bmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lastSelection && Date.now() - lastSelection.timestamp <= 5000) {
        createBookmark(lastSelection, 'bookmark');
        lastSelection = null;
      }
      hideFloatBtn();
    });

    const replyBtn = document.createElement('button');
    replyBtn.className = 'crpb-float-btn';
    replyBtn.textContent = 'Reply';
    replyBtn.setAttribute('aria-label', 'Bookmark and copy to input');
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lastSelection && Date.now() - lastSelection.timestamp <= 5000) {
        createBookmark(lastSelection, 'reply');
        injectAndFill(lastSelection.text);
        lastSelection = null;
      }
      hideFloatBtn();
    });

    floatBtn.appendChild(bmBtn);
    floatBtn.appendChild(replyBtn);
    document.body.appendChild(floatBtn);
    return floatBtn;
  }

  function showFloatBtn(range) {
    const row = ensureFloatBtn();
    const rect = range.getBoundingClientRect();
    const rowW = 160;
    row.style.top  = Math.max(8, rect.top - 38) + 'px';
    row.style.left = Math.min(rect.right - rowW, window.innerWidth - rowW - 8) + 'px';
    row.classList.add('crpb-float-visible');
  }

  function hideFloatBtn() {
    if (floatBtn) floatBtn.classList.remove('crpb-float-visible');
  }

  if (SITE === 'gemini') {
    document.addEventListener('mouseup', () => {
      if (!lastSelection || Date.now() - lastSelection.timestamp > 5000) {
        hideFloatBtn();
        return;
      }
      showFloatBtn(lastSelection.range);
    });
  }

  document.addEventListener('mousedown', (e) => {
    if (sidecarBtnContainer && !sidecarBtnContainer.contains(e.target)) hideSidecarBtns();
    if (SITE === 'gemini') {
      if (floatBtn && floatBtn.contains(e.target)) return;
      hideFloatBtn();
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // SIDECAR SEND — floating action buttons on selection
  // ────────────────────────────────────────────────────────────────────

  const SIDECAR_PROMPTS = [
    { label: 'Explain', prefix: 'Please explain this:\n\n' },
    { label: 'Define',  prefix: 'Please define this term or concept:\n\n' },
    { label: 'Search',  prefix: 'Please search and summarize information about:\n\n' },
  ];

  let sidecarBtnContainer = null;
  let isReceiver = false;

  function ensureSidecarBtns() {
    if (sidecarBtnContainer) return sidecarBtnContainer;
    sidecarBtnContainer = document.createElement('div');
    sidecarBtnContainer.className = 'crpb-sidecar-btns';

    if (SITE === 'claude') {
      const bmBtn = document.createElement('button');
      bmBtn.className = 'crpb-sidecar-action';
      bmBtn.textContent = 'Bookmark';
      bmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!lastSelection || Date.now() - lastSelection.timestamp > 10000) return;
        createBookmark(lastSelection, 'bookmark');
        hideSidecarBtns();
      });
      sidecarBtnContainer.appendChild(bmBtn);
    }

    const tagBtn = document.createElement('button');
    tagBtn.className = 'crpb-sidecar-action';
    tagBtn.textContent = 'Tag';
    tagBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!lastSelection || Date.now() - lastSelection.timestamp > 10000) return;
      const tag = '<,' + slugify(lastSelection.text) + '>';
      insertAtCursor(tag);
      chrome.runtime.sendMessage({ action: 'sidecar-send', text: tag, submit: false });
      hideSidecarBtns();
    });
    sidecarBtnContainer.appendChild(tagBtn);

    for (const { label, prefix } of SIDECAR_PROMPTS) {
      const btn = document.createElement('button');
      btn.className = 'crpb-sidecar-action crpb-sidecar-dispatch';
      btn.textContent = label;
      btn.dataset.prefix = prefix;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!lastSelection || Date.now() - lastSelection.timestamp > 10000) return;
        const text = btn.dataset.prefix + lastSelection.text;
        chrome.runtime.sendMessage({ action: 'sidecar-send', text }, (resp) => {
          if (!resp || resp.count === 0) {
            showSidecarFeedback('No sidecar tab registered');
          }
        });
        hideSidecarBtns();
      });
      sidecarBtnContainer.appendChild(btn);
    }
    document.body.appendChild(sidecarBtnContainer);
    return sidecarBtnContainer;
  }

  function showSidecarBtns(range) {
    const container = ensureSidecarBtns();
    // Dispatch buttons (Explain/Define/Search) are pointless on a receiver tab
    // — they'd just send to themselves. Hide them; Bookmark and Tag still work.
    container.querySelectorAll('.crpb-sidecar-dispatch').forEach(btn => {
      btn.style.display = isReceiver ? 'none' : '';
    });
    if (SITE === 'claude') {
      _positionSidecarVsTooltip(container, range);
    } else {
      const rect = range.getBoundingClientRect();
      container.style.top  = Math.max(8, rect.top - 46) + 'px';
      container.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
      container.classList.add('crpb-sidecar-visible');
    }
  }

  function _positionNextToTooltip(container, tooltip) {
    const rect = tooltip.getBoundingClientRect();
    // Place below the tooltip so it never overlaps the Reply button.
    container.style.top  = (rect.bottom + 4) + 'px';
    container.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + 'px';
    container.classList.add('crpb-sidecar-visible');
  }

  function _positionSidecarVsTooltip(container, range) {
    // The Reply tooltip is injected asynchronously by Claude's code.
    const tooltip = document.querySelector('[data-selection-tooltip="true"]');
    if (tooltip) {
      _positionNextToTooltip(container, tooltip);
      return;
    }
    let obs = null;
    let fallback = null;
    function cleanup() {
      if (obs) { obs.disconnect(); obs = null; }
      if (fallback) { clearTimeout(fallback); fallback = null; }
    }
    obs = new MutationObserver(() => {
      const tt = document.querySelector('[data-selection-tooltip="true"]');
      if (tt) { cleanup(); _positionNextToTooltip(container, tt); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Fallback: if tooltip never appears, position above the selection.
    fallback = setTimeout(() => {
      cleanup();
      if (container.classList.contains('crpb-sidecar-visible')) return;
      const rect = range.getBoundingClientRect();
      container.style.top  = Math.max(8, rect.top - 46) + 'px';
      container.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
      container.classList.add('crpb-sidecar-visible');
    }, 500);
  }

  function hideSidecarBtns() {
    if (sidecarBtnContainer) sidecarBtnContainer.classList.remove('crpb-sidecar-visible');
  }

  function showSidecarFeedback(msg) {
    const fb = document.createElement('div');
    fb.className = 'crpb-sidecar-feedback';
    fb.textContent = msg;
    document.body.appendChild(fb);
    setTimeout(() => fb.remove(), 2500);
  }

  // ────────────────────────────────────────────────────────────────────
  // RECEIVER — accept incoming sidecar text and inject into input box
  // ────────────────────────────────────────────────────────────────────

  const INPUT_SELECTORS = [
    'div[contenteditable="true"].ProseMirror',
    'fieldset div[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ];

  const SUBMIT_SELECTORS = [
    'button[aria-label="Send message"]',
    'button[aria-label*="Send" i]',
    'button[type="submit"]',
  ];

  function findInput() {
    for (const sel of INPUT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findSubmit() {
    for (const sel of SUBMIT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function injectAndSubmit(text) {
    const input = findInput();
    if (!input) {
      showSidecarFeedback('Could not find input box');
      return;
    }
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    setTimeout(() => {
      const submitBtn = findSubmit();
      if (submitBtn) {
        submitBtn.click();
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          bubbles: true, cancelable: true,
        }));
      }
    }, 80);
  }

  function injectAndFill(text) {
    const input = findInput();
    if (!input) return;
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }

  function insertAtCursor(text) {
    const input = findInput();
    if (!input) return;
    input.focus();
    document.execCommand('insertText', false, text);
  }

  function slugify(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'sidecar-receive') {
      if (msg.submit === false) {
        injectAndFill(msg.text);
      } else {
        injectAndSubmit(msg.text);
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // SCROLL UTILS
  // ────────────────────────────────────────────────────────────────────

  function findScrollContainer(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const ov = window.getComputedStyle(node).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.documentElement;
  }

  // ────────────────────────────────────────────────────────────────────
  // CREATE BOOKMARK
  // ────────────────────────────────────────────────────────────────────

  const pendingBookmarks = [];

  function createBookmark(selection, type = 'bookmark') {
    const title = selection.text.length > TITLE_LENGTH
      ? selection.text.slice(0, TITLE_LENGTH).trimEnd() + '…'
      : selection.text;

    const el = selection.assistantTurn;
    const container = findScrollContainer(el);
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const elBottomInContent = elRect.bottom - cRect.top + container.scrollTop;
    const scrollB = Math.max(0, elBottomInContent - container.clientHeight);

    const bookmark = {
      id: nextId++,
      title,
      type,
      anchorA: { element: el, range: selection.range },
      scrollContainer: container,
      scrollB,
    };

    bookmarks.unshift(bookmark);
    pendingBookmarks.push(bookmark);
    while (bookmarks.length > MAX_BOOKMARKS) bookmarks.pop();
    renderSidebar();
  }

  // ────────────────────────────────────────────────────────────────────
  // ANCHOR B: link sent user-turn to pending bookmarks
  // ────────────────────────────────────────────────────────────────────

  function onNewUserTurn(el) {
    if (!pendingBookmarks.length) return;
    for (const bm of pendingBookmarks) bm.anchorB = el;
    pendingBookmarks.length = 0;
    renderSidebar();
  }

  function startObserver() {
    const userMsgSels = SEL.USER_MESSAGE;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const direct = userMsgSels.some(s => { try { return node.matches(s); } catch { return false; } });
          if (direct) { onNewUserTurn(node); return; }
          for (const s of userMsgSels) {
            try {
              const nested = node.querySelector(s);
              if (nested) { onNewUserTurn(nested); return; }
            } catch { /* skip */ }
          }
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
        <span class="crpb-title">${SITE === 'claude' ? 'Reply tags' : 'Bookmarks'}</span>
        <button class="crpb-sidecar-toggle" aria-label="Toggle sidecar receiver" title="Sidecar: receive lookups from other tabs">⊕</button>
        <button class="crpb-clear-btn" aria-label="Clear all bookmarks" title="Clear all">×</button>
        <button class="crpb-toggle" aria-label="Collapse"></button>
      </div>
      <ul class="crpb-list" role="list"></ul>
      <div class="crpb-empty">No bookmarks yet. Select text in a response to bookmark your place.</div>
    `;
    document.body.appendChild(sidebarRoot);

    // Sidecar toggle — register/unregister this tab as a receiver.
    const sidecarToggle = sidebarRoot.querySelector('.crpb-sidecar-toggle');
    chrome.runtime.sendMessage({ action: 'sidecar-status' }, (resp) => {
      if (resp && resp.isReceiver) {
        sidecarToggle.classList.add('crpb-sidecar-active');
        isReceiver = true;
      }
    });
    sidecarToggle.addEventListener('click', () => {
      const active = sidecarToggle.classList.toggle('crpb-sidecar-active');
      isReceiver = active;
      chrome.runtime.sendMessage({
        action: active ? 'sidecar-register' : 'sidecar-unregister',
      });
    });

    sidebarRoot.querySelector('.crpb-toggle').addEventListener('click', () => {
      collapsed = !collapsed;
      sidebarRoot.classList.toggle('crpb-collapsed', collapsed);
    });
    sidebarRoot.querySelector('.crpb-clear-btn').addEventListener('click', () => {
      bookmarks.length = 0;
      renderSidebar();
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
      const iconSpan = document.createElement('span');
      iconSpan.className = 'crpb-bm-icon ' + (bm.type === 'reply' ? 'crpb-bm-icon-reply' : 'crpb-bm-icon-mark');
      iconSpan.textContent = bm.type === 'reply' ? '↩' : '◈';
      titleBtn.appendChild(iconSpan);
      titleBtn.appendChild(document.createTextNode(bm.title));
      titleBtn.title = 'Jump to where you were reading';
      titleBtn.addEventListener('click', () => jumpToA(bm));

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
      if (SITE === 'claude') {
        const bBtn = document.createElement('button');
        bBtn.className = 'crpb-b-btn';
        bBtn.setAttribute('aria-label', 'Jump to end of this assistant response');
        bBtn.title = 'Jump to end of this assistant response';
        bBtn.textContent = '↓';
        bBtn.addEventListener('click', () => jumpToB(bm));
        li.appendChild(bBtn);
      }
      li.appendChild(removeBtn);
      list.appendChild(li);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // JUMP + FLASH
  // ────────────────────────────────────────────────────────────────────

  function jumpToA(bm) {
    const range = bm.anchorA.range;
    let target;
    try {
      const startNode = range.startContainer;
      const el = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
      target = (el && document.body.contains(el)) ? el : bm.anchorA.element;
    } catch {
      target = bm.anchorA.element;
    }
    if (!target || !document.body.contains(target)) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => flashRange(bm.anchorA.range), 300);
  }

  function jumpToB(bm) {
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
      flash.style.left   = (rect.left + window.scrollX) + 'px';
      flash.style.top    = (rect.top  + window.scrollY) + 'px';
      flash.style.width  = rect.width  + 'px';
      flash.style.height = rect.height + 'px';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 1200);
    } catch {
      // Range may have been invalidated by DOM changes.
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
