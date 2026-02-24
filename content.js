// Prevent re-execution if already injected
if (window.hasTerrorDarkMode) {
    // Already injected
} else {
    window.hasTerrorDarkMode = true;

    // ── Pre-compiled Constants ──
    const RGB_REGEX = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/;
    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD',
        'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'DEFS'
    ]);
    const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA']);
    const WALKER_FILTER = {
        acceptNode(node) {
            return SKIP_TAGS.has(node.tagName)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
        }
    };

    const brightenCache = new Map();
    const BRIGHTEN_CACHE_MAX = 512;
    const IS_WIKIPEDIA = window.location.hostname.includes('wikipedia.org');
    const ROOT_DOMAIN = getRootDomain(window.location.hostname);

    // ── Safety Timeout ──
    setTimeout(() => {
        if (!document.documentElement.dataset.smartDarkReady) {
            document.documentElement.dataset.smartDarkReady = 'true';
        }
    }, 3000);

    // ── State ──
    let isEnabled = false;
    let observer = null;
    let currentThemeKey = 'obsidian';
    let processingQueue = new Set();
    let isProcessing = false;
    let nodesProcessed = 0;
    let isApplying = false;

    let cachedThemeColor = '#1A1A1B';
    let cachedThemeType = 'dark';

    function updateThemeCache() {
        const t = THEMES[currentThemeKey];
        cachedThemeColor = t ? t.color : '#121212';
        cachedThemeType = t ? t.type : 'dark';
    }

    // ── Dimmer State ──
    let dimmerOverlay = null;
    let currentDimmerOpacity = 0;

    // ── Domain Utility ──
    function getRootDomain(hostname) {
        const parts = hostname.split('.');
        const knownTLDs = new Set(['co.uk', 'com.br', 'co.jp', 'com.au', 'co.nz', 'org.uk']);
        const lastTwo = parts.slice(-2).join('.');
        if (knownTLDs.has(lastTwo) && parts.length > 2) return parts.slice(-3).join('.');
        return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    }

    // ── Initialization (per-site) ──
    chrome.storage.local.get({
        theme: 'obsidian',
        siteSettings: {}
    }, (items) => {
        const siteConfig = items.siteSettings[ROOT_DOMAIN] || { dimmer: 0, darkMode: false };

        // Always apply dimmer
        createDimmerOverlay();
        setDimmer(siteConfig.dimmer || 0, false);

        // Per-site dark mode
        if (siteConfig.darkMode) {
            currentThemeKey = items.theme;
            updateThemeCache();
            enableDarkMode();
        } else {
            isEnabled = false;
            document.documentElement.dataset.smartDarkReady = 'true';
        }
    });

    // ── Message Listener ──
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'ENABLE') {
            chrome.storage.local.get(['theme', 'siteSettings'], (items) => {
                currentThemeKey = items.theme || 'obsidian';
                updateThemeCache();
                const siteConfig = (items.siteSettings || {})[ROOT_DOMAIN] || {};
                setDimmer(siteConfig.dimmer || 0, false);
                enableDarkMode();
            });
        } else if (request.action === 'DISABLE') {
            disableDarkMode();
        } else if (request.action === 'SET_DIMMER') {
            setDimmer(request.value, true);
        } else if (request.action === 'GET_DIMMER') {
            sendResponse({ opacity: currentDimmerOpacity, domain: ROOT_DOMAIN });
            return true;
        }
    });

    // ── Storage Change Listener ──
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.theme && isEnabled) {
            disableDarkMode();
            currentThemeKey = changes.theme.newValue;
            updateThemeCache();
            isEnabled = true;
            enableDarkMode();
        }

        if (changes.siteSettings) {
            const oldConfig = (changes.siteSettings.oldValue || {})[ROOT_DOMAIN] || { dimmer: 0, darkMode: false };
            const newConfig = (changes.siteSettings.newValue || {})[ROOT_DOMAIN] || { dimmer: 0, darkMode: false };

            // Dimmer changed
            if ((oldConfig.dimmer || 0) !== (newConfig.dimmer || 0)) {
                setDimmer(newConfig.dimmer || 0, false);
            }

            // Dark mode changed (handled via ENABLE/DISABLE messages from background)
        }
    });

    // ── Dimmer ──
    function createDimmerOverlay() {
        if (dimmerOverlay) return;
        dimmerOverlay = document.createElement('div');
        dimmerOverlay.id = 'terror-dimmer-overlay';
        dimmerOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:black;opacity:0;pointer-events:none;z-index:2147483646;transition:opacity .1s ease;display:block';
        document.documentElement.appendChild(dimmerOverlay);
    }

    function setDimmer(opacity, saveToStorage) {
        if (!dimmerOverlay) createDimmerOverlay();
        currentDimmerOpacity = opacity;
        dimmerOverlay.style.opacity = opacity;
        if (!document.documentElement.contains(dimmerOverlay)) {
            document.documentElement.appendChild(dimmerOverlay);
        }
        if (saveToStorage) {
            chrome.storage.local.get({ siteSettings: {} }, (items) => {
                const settings = items.siteSettings;
                if (!settings[ROOT_DOMAIN]) {
                    settings[ROOT_DOMAIN] = { dimmer: 0, darkMode: false };
                }
                settings[ROOT_DOMAIN].dimmer = opacity;

                // Clean up if both are off
                if (!settings[ROOT_DOMAIN].darkMode && opacity === 0) {
                    delete settings[ROOT_DOMAIN];
                }

                chrome.storage.local.set({ siteSettings: settings });
            });
        }
    }

    // ── Color Analysis ──
    function parseColor(color) {
        const m = color.match(RGB_REGEX);
        if (!m) return null;
        return {
            r: m[1] | 0,
            g: m[2] | 0,
            b: m[3] | 0,
            a: m[4] !== undefined ? +m[4] : 1,
            brightness: ((m[1] | 0) * 299 + (m[2] | 0) * 587 + (m[3] | 0) * 114) / 1000
        };
    }

    function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }

    function smartBrighten(color) {
        const cached = brightenCache.get(color);
        if (cached) return cached;

        const m = color.match(RGB_REGEX);
        if (!m) return color;

        let r = (m[1] | 0) / 255, g = (m[2] | 0) / 255, b = (m[3] | 0) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
        }

        if (s > 0 && l < 0.6) l = 0.7;

        let r1, g1, b1;
        if (s === 0) {
            r1 = g1 = b1 = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r1 = hue2rgb(p, q, h + 1 / 3);
            g1 = hue2rgb(p, q, h);
            b1 = hue2rgb(p, q, h - 1 / 3);
        }

        const result = `rgb(${Math.round(r1 * 255)}, ${Math.round(g1 * 255)}, ${Math.round(b1 * 255)})`;
        if (brightenCache.size >= BRIGHTEN_CACHE_MAX) {
            brightenCache.delete(brightenCache.keys().next().value);
        }
        brightenCache.set(color, result);
        return result;
    }

    // ── Core Processing ──
    function processElement(element) {
        if (!isEnabled) return;

        const tag = element.tagName;
        if (IS_WIKIPEDIA && tag === 'INPUT' && (element.type === 'search' || element.name === 'search')) return;
        if (SKIP_TAGS.has(tag)) return;

        const computed = window.getComputedStyle(element);
        const bgColor = computed.backgroundColor;
        const textColor = computed.color;

        if (element.dataset.smartDarkProcessed) {
            const isTransparent = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
            if (!isTransparent) {
                const bgParsed = parseColor(bgColor);
                if (bgParsed && bgParsed.brightness > 128 && bgParsed.a >= 0.1) {
                    // External JS reset — re-process
                } else {
                    return;
                }
            } else {
                return;
            }
        }

        const bgParsed = parseColor(bgColor);
        const textParsed = parseColor(textColor);
        const isTransparent = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
        const isInput = INPUT_TAGS.has(tag);
        let hasUpdates = false;

        if (bgParsed && bgParsed.a >= 0.1) {
            if ((!isTransparent && bgParsed.brightness > 128) || (isInput && bgParsed.brightness > 128)) {
                element.dataset.originalBg = element.style.backgroundColor;
                element.style.setProperty('background-color', cachedThemeColor, 'important');
                if (isInput) element.style.setProperty('background-image', 'none', 'important');
                hasUpdates = true;
            }
        }

        if (textParsed && textParsed.brightness < 128) {
            if (cachedThemeType === 'dark') {
                element.dataset.originalColor = element.style.color;
                const { r, g, b } = textParsed;
                const isNeutral = Math.abs(r - g) <= 10 && Math.abs(r - b) <= 10 && Math.abs(g - b) <= 10;
                element.style.setProperty('color', isNeutral ? '#e0e0e0' : smartBrighten(textColor), 'important');
                hasUpdates = true;
            }
        }

        if (hasUpdates || (bgParsed && !isTransparent)) {
            element.dataset.smartDarkProcessed = 'true';
        }
    }

    // ── Queue Processing ──
    function scheduleProcessing() {
        if (isProcessing) return;
        isProcessing = true;
        requestAnimationFrame(processQueue);
    }

    function processQueue() {
        const startTime = performance.now();
        const budget = 10;
        let timeCheck = 0;
        isApplying = true;

        while (processingQueue.size > 0) {
            const [el] = processingQueue;
            processingQueue.delete(el);
            if (!document.contains(el)) continue;

            if (!el._walker) {
                el._walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, WALKER_FILTER);
                processElement(el);
                nodesProcessed++;
            }

            const walker = el._walker;
            let finished = false;

            while (true) {
                if ((++timeCheck & 7) === 0 && performance.now() - startTime > budget) {
                    processingQueue.add(el);
                    break;
                }
                if (walker.nextNode()) {
                    processElement(walker.currentNode);
                    nodesProcessed++;
                } else {
                    finished = true;
                    break;
                }
            }

            if (finished) delete el._walker;

            if (!document.documentElement.dataset.smartDarkReady && nodesProcessed > 2500) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    document.documentElement.dataset.smartDarkReady = 'true';
                }));
            }

            if ((timeCheck & 7) === 0 && performance.now() - startTime > budget) break;
        }

        isApplying = false;

        if (processingQueue.size > 0) {
            isProcessing = true;
            requestAnimationFrame(processQueue);
        } else {
            isProcessing = false;
            if (!document.documentElement.dataset.smartDarkReady) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    document.documentElement.dataset.smartDarkReady = 'true';
                }));
            }
        }
    }

    function processNode(node) {
        if (node.nodeType === 1) {
            processingQueue.add(node);
            scheduleProcessing();
        }
    }

    // ── Enable / Disable ──
    function enableDarkMode() {
        if (!isEnabled) isEnabled = true;
        nodesProcessed = 0;
        brightenCache.clear();
        delete document.documentElement.dataset.smartDarkReady;

        const processed = document.querySelectorAll('[data-smart-dark-processed="true"]');
        for (let i = 0; i < processed.length; i++) delete processed[i].dataset.smartDarkProcessed;

        document.documentElement.dataset.originalBg = document.documentElement.style.backgroundColor;
        document.documentElement.style.backgroundColor = cachedThemeColor;
        document.documentElement.style.colorScheme = 'dark';

        const updateBody = () => {
            if (document.body) {
                if (!document.body.dataset.originalBg) {
                    document.body.dataset.originalBg = document.body.style.backgroundColor;
                }
                document.body.style.backgroundColor = cachedThemeColor;
                if (currentDimmerOpacity > 0) setDimmer(currentDimmerOpacity, false);
                processNode(document.body);
                startObserver();
            }
        };

        if (document.body) updateBody();
        else document.addEventListener('DOMContentLoaded', updateBody);
    }

    function startObserver() {
        if (observer || !document.body) return;

        let pendingNodes = [];
        let mutationTimer = 0;

        observer = new MutationObserver((mutations) => {
            if (!isEnabled || isApplying) return;
            for (let i = 0; i < mutations.length; i++) {
                const added = mutations[i].addedNodes;
                for (let j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 1) pendingNodes.push(added[j]);
                }
            }
            if (!mutationTimer) {
                mutationTimer = requestAnimationFrame(() => {
                    for (let i = 0; i < pendingNodes.length; i++) processingQueue.add(pendingNodes[i]);
                    pendingNodes = [];
                    mutationTimer = 0;
                    scheduleProcessing();
                });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function disableDarkMode() {
        if (!isEnabled) return;
        isEnabled = false;

        if (observer) { observer.disconnect(); observer = null; }
        processingQueue.clear();
        brightenCache.clear();
        document.documentElement.dataset.smartDarkReady = 'true';

        const themeColors = new Set();
        for (const key in THEMES) themeColors.add(THEMES[key].color);

        const processed = document.querySelectorAll('[data-smart-dark-processed="true"]');
        for (let i = 0; i < processed.length; i++) {
            const el = processed[i];
            if (el.dataset.originalBg !== undefined) {
                el.style.backgroundColor = el.dataset.originalBg;
                delete el.dataset.originalBg;
            } else if (themeColors.has(el.style.backgroundColor)) {
                el.style.backgroundColor = '';
            }
            if (el.dataset.originalColor !== undefined) {
                el.style.color = el.dataset.originalColor;
                delete el.dataset.originalColor;
            } else if (el.style.color === 'rgb(224, 224, 224)' || el.style.color === '#e0e0e0') {
                el.style.color = '';
            }
            if (el.dataset.originalFilter !== undefined) {
                el.style.filter = el.dataset.originalFilter;
                delete el.dataset.originalFilter;
            } else if (el.style.filter === 'brightness(0.8)') {
                el.style.filter = '';
            }
            delete el.dataset.smartDarkProcessed;
        }

        if (document.documentElement.dataset.originalBg !== undefined) {
            document.documentElement.style.backgroundColor = document.documentElement.dataset.originalBg;
        } else {
            document.documentElement.style.backgroundColor = '';
        }
        if (document.body && document.body.dataset.originalBg !== undefined) {
            document.body.style.backgroundColor = document.body.dataset.originalBg;
        } else if (document.body) {
            document.body.style.backgroundColor = '';
        }
        document.documentElement.style.colorScheme = '';
    }
}
