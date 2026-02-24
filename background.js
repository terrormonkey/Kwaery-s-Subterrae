
const CSS_SCRIPT_ID = 'terror-flash-prevent';

// ── Migration + Init ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({
    // Old keys (for migration)
    globalEnabled: null,
    dimmerSites: null,
    // New keys
    siteSettings: null,
    theme: 'obsidian',
    installDate: Date.now(),
    totalActiveTime: 0
  }, (items) => {
    if (!items.installDate) items.installDate = Date.now();

    // Migrate old format → new format
    if (items.siteSettings === null) {
      const newSettings = {};

      if (items.dimmerSites) {
        for (const domain in items.dimmerSites) {
          newSettings[domain] = {
            dimmer: items.dimmerSites[domain],
            darkMode: !!items.globalEnabled
          };
        }
      }

      chrome.storage.local.set({
        siteSettings: newSettings,
        theme: items.theme,
        installDate: items.installDate,
        totalActiveTime: items.totalActiveTime
      });

      // Clean up old keys
      chrome.storage.local.remove(['globalEnabled', 'dimmerSites']);
    }

    // Always register flash prevention CSS (content.js reveals page quickly if DM is off)
    registerFlashPreventionCSS();
    startTracking();
  });
});

chrome.runtime.onStartup.addListener(() => {
  registerFlashPreventionCSS();
  startTracking();
});

// ── Time Tracking ──
function startTracking() {
  chrome.alarms.create('trackingTimer', { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'trackingTimer') {
    chrome.storage.local.get(['totalActiveTime', 'siteSettings'], (data) => {
      // Track time if any site has dark mode enabled
      const settings = data.siteSettings || {};
      const anyEnabled = Object.values(settings).some(s => s.darkMode);
      if (anyEnabled) {
        const newTime = (data.totalActiveTime || 0) + 60000;
        chrome.storage.local.set({ totalActiveTime: newTime });
      }
    });
  }
});

// ── Flash Prevention CSS ──
async function registerFlashPreventionCSS() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [CSS_SCRIPT_ID] });
    if (scripts.length === 0) {
      await chrome.scripting.registerContentScripts([{
        id: CSS_SCRIPT_ID,
        matches: ['<all_urls>'],
        css: ['flash_prevent.css'],
        runAt: 'document_start'
      }]);
    }
  } catch (err) {
    console.error("Failed to register CSS:", err);
  }
}

// ── Utility ──
function getRootDomain(hostname) {
  const parts = hostname.split('.');
  const knownTLDs = new Set(['co.uk', 'com.br', 'co.jp', 'com.au', 'co.nz', 'org.uk']);
  const lastTwo = parts.slice(-2).join('.');
  if (knownTLDs.has(lastTwo) && parts.length > 2) return parts.slice(-3).join('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

function formatDuration(ms) {
  if (!ms) ms = 0;
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours}h ${minutes}m`;
}

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleDateString() : 'Unknown';
}

// ── Visual Updates (icon + tooltip) ──
function updateVisuals(tabId, isEnabledForSite, installDate, totalActiveTime) {
  chrome.action.setBadgeText({ text: "", tabId });

  const iconSuffix = isEnabledForSite ? "_on" : "_off";
  chrome.action.setIcon({
    path: {
      "16": `icons/icon16${iconSuffix}.png`,
      "48": `icons/icon48${iconSuffix}.png`,
      "128": `icons/icon128${iconSuffix}.png`
    },
    tabId
  });

  const status = isEnabledForSite ? "ON" : "OFF";
  const shortcuts = "Shortcuts:\nShift+X: Toggle\nShift+Y: Dimmer\nShift+<: Colors";
  const stats = `Installed: ${formatDate(installDate)}\nActive: ${formatDuration(totalActiveTime)}`;
  chrome.action.setTitle({
    title: `TerrorDarkmode: ${status}\n\n${shortcuts}\n\n${stats}`,
    tabId
  });
}

function updateStatus(tabId, urlString) {
  if (!urlString || urlString.startsWith("chrome://") || urlString.startsWith("edge://")) return;

  try {
    const url = new URL(urlString);
    const domain = getRootDomain(url.hostname);

    chrome.storage.local.get(['siteSettings', 'installDate', 'totalActiveTime'], (data) => {
      const settings = (data.siteSettings || {})[domain] || {};
      updateVisuals(tabId, !!settings.darkMode, data.installDate, data.totalActiveTime);
    });
  } catch (e) { /* Invalid URL */ }
}

// ── Per-Site Toggle ──
function toggleDarkMode(tab) {
  if (tab && (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://"))) return;

  // Determine domain from the provided tab, or from the active tab
  const doToggle = (targetTab) => {
    if (!targetTab || !targetTab.url) return;

    let domain;
    try {
      domain = getRootDomain(new URL(targetTab.url).hostname);
    } catch (e) { return; }

    chrome.storage.local.get(['siteSettings', 'installDate', 'totalActiveTime'], (data) => {
      const siteSettings = data.siteSettings || {};
      const current = siteSettings[domain] || { dimmer: 0, darkMode: false };
      current.darkMode = !current.darkMode;
      siteSettings[domain] = current;

      // Clean up entry if both are off/zero
      if (!current.darkMode && (!current.dimmer || current.dimmer === 0)) {
        delete siteSettings[domain];
      }

      chrome.storage.local.set({ siteSettings });

      // Update ALL tabs that share this domain
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          if (!t.url) continue;
          try {
            const tabDomain = getRootDomain(new URL(t.url).hostname);
            if (tabDomain === domain) {
              updateVisuals(t.id, current.darkMode, data.installDate, data.totalActiveTime);
              chrome.tabs.sendMessage(t.id, {
                action: current.darkMode ? "ENABLE" : "DISABLE"
              }).catch(() => { });
            }
          } catch (e) { /* skip invalid URLs */ }
        }
      });
    });
  };

  if (tab) {
    doToggle(tab);
  } else {
    // Called from popup without tab context — use active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) doToggle(tabs[0]);
    });
  }
}

// ── Tab Event Listeners ──
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) updateStatus(activeInfo.tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateStatus(tabId, tab.url);
  }
});

// ── Message Handler ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TOGGLE_REQUEST' && sender.tab) {
    toggleDarkMode(sender.tab);
  } else if (request.action === 'TOGGLE_FROM_POPUP') {
    toggleDarkMode(null);
  }
});
