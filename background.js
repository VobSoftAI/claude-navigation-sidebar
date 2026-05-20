// background.js — sidecar lookup routing

const STORAGE_KEY = 'sidecarReceivers';

async function getReceivers() {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return new Set(result[STORAGE_KEY] || []);
}

async function setReceivers(set) {
  await chrome.storage.session.set({ [STORAGE_KEY]: [...set] });
}

async function registerReceiver(tabId) {
  const receivers = await getReceivers();
  receivers.add(tabId);
  await setReceivers(receivers);
}

async function unregisterReceiver(tabId) {
  const receivers = await getReceivers();
  receivers.delete(tabId);
  await setReceivers(receivers);
}

// Clean up when a tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  unregisterReceiver(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'sidecar-register') {
    registerReceiver(sender.tab.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === 'sidecar-unregister') {
    unregisterReceiver(sender.tab.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === 'sidecar-send') {
    // Route to all registered receivers except the sender.
    getReceivers().then((receivers) => {
      for (const tabId of receivers) {
        if (tabId === sender.tab.id) continue;
        chrome.tabs.sendMessage(tabId, {
          action: 'sidecar-receive',
          text: msg.text,
          submit: msg.submit !== false,
        }).catch(() => {
          // Tab may have navigated away — remove it.
          unregisterReceiver(tabId);
        });
      }
      sendResponse({ ok: true, count: receivers.size });
    });
    return true;
  }

  if (msg.action === 'sidecar-status') {
    getReceivers().then((receivers) => {
      sendResponse({ isReceiver: receivers.has(sender.tab.id) });
    });
    return true;
  }
});
