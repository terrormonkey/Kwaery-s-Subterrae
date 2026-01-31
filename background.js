
const CSS_SCRIPT_ID = 'terror-flash-prevent';

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default settings if not present
  chrome.storage.local.get({
    theme: 'dark-gray',
    globalEnabled: false, // Default to false
    installDate: Date.now(),
    totalActiveTime: 0
  }, (items) => {
    // Ensure installDate is set if it was missing (e.g. update)
    if (!items.installDate) items.installDate = Date.now();

    chrome.storage.local.set(items);

    // On install/startup, verify CSS registration based on stored state
    if (items.globalEnabled) {
      registerFlashPreventionCSS();
      startTracking();
    } else {
      unregisterFlashPreventionCSS();
      stopTracking();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['globalEnabled'], (items) => {
    if (items.globalEnabled) {
      registerFlashPreventionCSS();
      startTracking();
    } else {
      unregisterFlashPreventionCSS();
      stopTracking();
    }
  });
});

// Time Tracking
function startTracking() {
    chrome.alarms.create('trackingTimer', { periodInMinutes: 1 });
}

function stopTracking() {
    chrome.alarms.clear('trackingTimer');
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'trackingTimer') {
        chrome.storage.local.get(['totalActiveTime', 'globalEnabled'], (data) => {
            if (data.globalEnabled) {
                const newTime = (data.totalActiveTime || 0) + 60000;
                chrome.storage.local.set({ totalActiveTime: newTime });
            }
        });
    }
});

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

async function unregisterFlashPreventionCSS() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [CSS_SCRIPT_ID] });
    if (scripts.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: [CSS_SCRIPT_ID] });
    }
  } catch (err) {
    console.error("Failed to unregister CSS:", err);
  }
}

function formatDuration(ms) {
    if (!ms) ms = 0;
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    return `${hours}h ${minutes}m ${seconds}s`;
}

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString();
}

function updateVisuals(tabId, isEnabled, installDate, totalActiveTime) {
  // Clear any badge text
  chrome.action.setBadgeText({ text: "", tabId: tabId });

  // Set Icon
  const iconSuffix = isEnabled ? "_on" : "_off";
  const path = {
    "16": `icons/icon16${iconSuffix}.png`,
    "48": `icons/icon48${iconSuffix}.png`,
    "128": `icons/icon128${iconSuffix}.png`
  };
  chrome.action.setIcon({ path: path, tabId: tabId });

  // Set Hover Title
  const status = isEnabled ? "ON" : "OFF";
  const shortcuts = "Shortcuts:\nShift+X: Toggle\nShift+Y: Dimmer\nShift+<: Colors";
  const stats = `Installed: ${formatDate(installDate)}\nActive: ${formatDuration(totalActiveTime)}`;
  const title = `TerrorDarkmode: ${status}\n\n${shortcuts}\n\n${stats}`;

  chrome.action.setTitle({ title: title, tabId: tabId });
}

function updateStatus(tabId, urlString) {
    if (!urlString || urlString.startsWith("chrome://") || urlString.startsWith("edge://")) return;
    
    try {
        const url = new URL(urlString);

        chrome.storage.local.get(['globalEnabled', 'installDate', 'totalActiveTime'], (data) => {
            updateVisuals(tabId, data.globalEnabled, data.installDate, data.totalActiveTime);
        });
    } catch (e) {
        // console.error("Invalid URL:", urlString);
    }
}

function toggleDarkMode(tab) {
    // If tab is provided, check URL. If not (from popup), skip check.
    if (tab && (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://"))) {
        return;
    }

    chrome.storage.local.get(['globalEnabled', 'installDate', 'totalActiveTime'], (data) => {
        const newGlobalEnabled = !data.globalEnabled;

        // Update storage
        chrome.storage.local.set({ globalEnabled: newGlobalEnabled });

        // Update CSS Registration & Tracking
        if (newGlobalEnabled) {
            registerFlashPreventionCSS();
            startTracking();
        } else {
            unregisterFlashPreventionCSS();
            stopTracking();
        }

        // Update Existing Tabs
        chrome.tabs.query({}, (tabs) => {
            for (const t of tabs) {
                updateVisuals(t.id, newGlobalEnabled, data.installDate, data.totalActiveTime);

                if (newGlobalEnabled) {
                    // Send ENABLE
                    chrome.tabs.sendMessage(t.id, { action: "ENABLE" }).catch(() => {});
                } else {
                    // Send DISABLE
                    chrome.tabs.sendMessage(t.id, { action: "DISABLE" }).catch(() => {});
                }
            }
        });
    });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  chrome.tabs.get(tabId, (tab) => {
     if (tab && tab.url) {
         updateStatus(tabId, tab.url);
     }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        updateStatus(tabId, tab.url);
    }
});

// chrome.action.onClicked is removed because default_popup is set in manifest.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TOGGLE_REQUEST' && sender.tab) {
      toggleDarkMode(sender.tab);
  } else if (request.action === 'TOGGLE_FROM_POPUP') {
      toggleDarkMode(null); // No specific tab context needed for global toggle
  }
});
