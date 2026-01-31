// Prevent re-execution if already injected
if (window.hasTerrorDarkMode) {
    // Already injected
} else {
    window.hasTerrorDarkMode = true;

    // THEMES are now loaded from themes.js

    // Pre-compiled Regex
    const RGB_REGEX = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/;

    // SAFETY MECHANISM: Prevent page from being stuck hidden forever
    setTimeout(() => {
        if (!document.documentElement.dataset.smartDarkReady) {
            document.documentElement.dataset.smartDarkReady = 'true';
        }
    }, 3000);

    let isEnabled = true; // Assume enabled if running (injected dynamically)
    let observer = null;
    let currentThemeKey = 'dark-gray';
    let processingQueue = new Set();
    let isProcessing = false;
    let nodesProcessed = 0;

    // Dimmer State
    let dimmerOverlay = null;
    let currentDimmerOpacity = 0;

    // Extract root domain from hostname (e.g., en.wikipedia.org -> wikipedia.org)
    function getRootDomain(hostname) {
        const parts = hostname.split('.');
        // Handle cases like co.uk, com.br etc.
        const knownTLDs = ['co.uk', 'com.br', 'co.jp', 'com.au', 'co.nz', 'org.uk'];
        const lastTwo = parts.slice(-2).join('.');
        if (knownTLDs.includes(lastTwo) && parts.length > 2) {
            return parts.slice(-3).join('.');
        }
        // Standard case: return last two parts
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    }

    // Initial setup - get theme preferences
    chrome.storage.local.get({
        theme: 'dark-gray',
        globalEnabled: false,
        dimmerSites: {}
    }, (items) => {
        // ALWAYS apply domain-specific dimmer regardless of globalEnabled
        const rootDomain = getRootDomain(window.location.hostname);
        const domainOpacity = items.dimmerSites[rootDomain] || 0;

        // Create overlay immediately and apply opacity
        createDimmerOverlay();
        setDimmer(domainOpacity, false); // false = don't save, just apply

        // Only enable Dark Mode logic if locally enabled
        if (items.globalEnabled) {
            currentThemeKey = items.theme;
            enableDarkMode();
        } else {
            isEnabled = false;
            document.documentElement.dataset.smartDarkReady = 'true';
        }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'ENABLE') {
            chrome.storage.local.get(['theme', 'dimmerSites'], (items) => {
                currentThemeKey = items.theme || 'dark-gray';
                const rootDomain = getRootDomain(window.location.hostname);
                const domainOpacity = (items.dimmerSites || {})[rootDomain] || 0;
                setDimmer(domainOpacity, false);
                enableDarkMode();
            });
        } else if (request.action === 'DISABLE') {
            disableDarkMode();
        } else if (request.action === 'SET_DIMMER') {
            setDimmer(request.value, true); // true = save to storage
        } else if (request.action === 'GET_DIMMER') {
            sendResponse({ opacity: currentDimmerOpacity, domain: getRootDomain(window.location.hostname) });
            return true; // Keep channel open for async response
        }
    });

    // Also listen for storage changes to update theme immediately
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.theme && isEnabled) {
                disableDarkMode();
                currentThemeKey = changes.theme.newValue;
                isEnabled = true;
                enableDarkMode();
            }
            if (changes.dimmerSites) {
                // Check if our domain's opacity changed
                const rootDomain = getRootDomain(window.location.hostname);
                const oldValue = (changes.dimmerSites.oldValue || {})[rootDomain] || 0;
                const newValue = (changes.dimmerSites.newValue || {})[rootDomain] || 0;
                if (oldValue !== newValue) {
                    setDimmer(newValue, false);
                }
            }
        }
    });

    // Dimmer Logic
    function createDimmerOverlay() {
        if (dimmerOverlay) return;

        dimmerOverlay = document.createElement('div');
        dimmerOverlay.id = 'terror-dimmer-overlay';
        Object.assign(dimmerOverlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'black',
            opacity: '0',
            pointerEvents: 'none',
            zIndex: '2147483646',
            transition: 'opacity 0.1s ease',
            display: 'block'
        });
        document.documentElement.appendChild(dimmerOverlay);
    }

    function setDimmer(opacity, saveToStorage = false) {
        if (!dimmerOverlay) createDimmerOverlay();
        currentDimmerOpacity = opacity;
        // If opacity is 0, we can hide it or just set opacity 0
        dimmerOverlay.style.opacity = opacity;
        dimmerOverlay.style.display = 'block';
        // Ensure it's in the DOM if re-added
        if (!document.documentElement.contains(dimmerOverlay)) {
            document.documentElement.appendChild(dimmerOverlay);
        }

        // Save to domain-specific storage
        if (saveToStorage) {
            const rootDomain = getRootDomain(window.location.hostname);
            chrome.storage.local.get({ dimmerSites: {} }, (items) => {
                const sites = items.dimmerSites;
                if (opacity > 0) {
                    sites[rootDomain] = opacity;
                } else {
                    delete sites[rootDomain];
                }
                chrome.storage.local.set({ dimmerSites: sites });
            });
        }
    }

    // Logic Functions

    function getThemeColor() {
        return THEMES[currentThemeKey] ? THEMES[currentThemeKey].color : '#121212';
    }

    function getThemeType() {
        return THEMES[currentThemeKey] ? THEMES[currentThemeKey].type : 'dark';
    }

    function isBright(color) {
        const match = color.match(RGB_REGEX);
        if (!match) return false;

        // Check Alpha
        if (match[4] !== undefined) {
            const alpha = parseFloat(match[4]);
            if (alpha < 0.1) return false; // Too transparent to matter
        }

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128;
    }

    function isDark(color) {
        const match = color.match(RGB_REGEX);
        if (!match) return false;
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 128;
    }

    function smartBrighten(color) {
        const match = color.match(RGB_REGEX);
        if (!match) return color;
        let r = parseInt(match[1]);
        let g = parseInt(match[2]);
        let b = parseInt(match[3]);

        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        if (s > 0) {
            if (l < 0.6) {
                l = 0.7;
            }
        }

        let r1, g1, b1;
        if (s === 0) {
            r1 = g1 = b1 = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r1 = hue2rgb(p, q, h + 1 / 3);
            g1 = hue2rgb(p, q, h);
            b1 = hue2rgb(p, q, h - 1 / 3);
        }

        return `rgb(${Math.round(r1 * 255)}, ${Math.round(g1 * 255)}, ${Math.round(b1 * 255)})`;
    }

    function calculateChange(element) {
        if (!isEnabled) return null;

        // Wikipedia Search Bar Exclusion: User requested to leave it white/ignored.
        if (window.location.hostname.includes('wikipedia.org')) {
            if (element.tagName === 'INPUT' && (element.type === 'search' || element.name === 'search')) {
                return null;
            }
        }

        if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'LINK') return null;

        const computed = window.getComputedStyle(element);
        const bgColor = computed.backgroundColor;
        const color = computed.color;

        if (element.dataset.smartDarkProcessed) {
            // Integrity Check: If we processed it, it should be dark (or transparent).
            // If it is now Bright and Opaque, it means external JS reset it.
            // We must re-process it.
            const isTrans = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
            if (!isTrans && isBright(bgColor)) {
                // Fall through to re-process
            } else {
                return null; // Integrity Verified
            }
        }

        const updates = {};
        const datasetUpdates = {};
        const themeType = getThemeType();

        const isTransparent = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
        const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

        if ((!isTransparent && isBright(bgColor)) || (isInput && isBright(bgColor))) {
            // Bright background logic
            datasetUpdates.originalBg = element.style.backgroundColor;
            updates.backgroundColor = getThemeColor();
            // Ensure inputs don't keep white gradients/images
            if (isInput) updates.backgroundImage = 'none';
            datasetUpdates.smartDarkProcessed = 'true';
        } else if (!isTransparent && isDark(bgColor)) {
            datasetUpdates.smartDarkProcessed = 'true';
        }

        // Text Color Logic
        if (isDark(color)) {
            // If theme is DARK: brighten dark text.
            // If theme is LIGHT: keep dark text.
            if (themeType === 'dark') {
                datasetUpdates.originalColor = element.style.color;

                const match = color.match(RGB_REGEX);
                let isNeutral = true;
                if (match) {
                    const r = parseInt(match[1]);
                    const g = parseInt(match[2]);
                    const b = parseInt(match[3]);
                    if (Math.abs(r - g) > 10 || Math.abs(r - b) > 10 || Math.abs(g - b) > 10) {
                        isNeutral = false;
                    }
                }

                if (isNeutral) {
                    updates.color = '#e0e0e0';
                } else {
                    updates.color = smartBrighten(color);
                }
                datasetUpdates.smartDarkProcessed = 'true';
            } else {
                // Light Theme: Dark text is acceptable, no changes required.
                datasetUpdates.smartDarkProcessed = 'true';
            }
        }

        // Dimmer overlay provides uniform dimming across all content.

        if (Object.keys(updates).length > 0 || Object.keys(datasetUpdates).length > 0) {
            return { element, updates, datasetUpdates };
        }
        return null;
    }

    function applyChange(change) {
        if (!change) return;
        const { element, updates, datasetUpdates } = change;

        for (const [key, value] of Object.entries(datasetUpdates)) {
            element.dataset[key] = value;
        }
        for (const [key, value] of Object.entries(updates)) {
            // Convert camelCase to kebab-case for setProperty
            const cssProperty = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            element.style.setProperty(cssProperty, value, 'important');
        }
    }

    function scheduleProcessing() {
        if (isProcessing) return;
        isProcessing = true;
        requestAnimationFrame(processQueue);
    }

    function processQueue() {
        const startTime = performance.now();
        const MaxExecutionTimeMs = 8; // Max 8ms per frame to leave room for other things

        while (processingQueue.size > 0) {
            // Pick next item
            const [el] = processingQueue;
            processingQueue.delete(el);

            if (!document.contains(el)) continue; // optimization if removed

            // Process subtree
            const filter = {
                acceptNode: function (node) {
                    const tag = node.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' ||
                        tag === 'META' || tag === 'HEAD' || tag === 'NOSCRIPT' ||
                        tag === 'TEMPLATE' || tag === 'SVG' || tag === 'PATH' || tag === 'DEFS') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            };

            // To be time-sliced efficiently, we can't do the whole subtree at once if it's huge.
            // But TreeWalker is sync.
            // Compromise: We use TreeWalker, but we check time every N nodes.
            // If we run out of time, we must PAUSE.
            // Pause means: Save the current walker state (node) and Resume next frame?
            // TreeWalker doesn't support "saving" easily other than keeping the instance.
            // For now, let's just process the QUEUE items time-sliced, but for each item (subtree),
            // we do it fully unless it's huge?
            // If `el` is `document.body`, that's huge.

            // Better Approach:
            // When we start a walker on `el`, we push the WALKER to a secondary queue or stack.
            // We consume from that walker until done or time up.

            // NOTE: Changing local implementation to support this.

            if (!el.walker) {
                el.walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, filter);
                // Process the root itself first
                const rootChange = calculateChange(el);
                if (rootChange) applyChange(rootChange);
                nodesProcessed++;
            }

            const walker = el.walker;
            let finished = false;

            while (true) {
                if (performance.now() - startTime > MaxExecutionTimeMs) {
                    // Time up. Put el back in queue (at start or end? Start is better to finish it)
                    processingQueue.add(el);
                    // But Set insertion order... we need to ensure it's picked up next.
                    // Set iterates in insertion order. If we add it again, it goes to the end.
                    // That's actually fine aka "Round Robin".
                    break; // Time up
                }

                if (walker.nextNode()) {
                    const change = calculateChange(walker.currentNode);
                    if (change) applyChange(change);
                    nodesProcessed++;
                } else {
                    finished = true;
                    break;
                }
            }

            if (finished) {
                // Done with this element
                delete el.walker;
                // processingQueue deleted it at top of loop
            } else {
                // Not finished, loop broke due to time.
                // We re-added it effectively by `processingQueue.add(el)`?
                // Wait, if I deleted it, `add` puts it at the END.
                // That's acceptable.
            }

            // Check if we can show the page (curtain removal)
            // Increased threshold from 800 to 2500 based on user feedback to prevent any white flash.
            if (!document.documentElement.dataset.smartDarkReady && nodesProcessed > 2500) {
                // Wrap in double rAF to ensure paint allows the style updates to render behind the curtain
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        document.documentElement.dataset.smartDarkReady = 'true';
                    });
                });
            }

            if (performance.now() - startTime > MaxExecutionTimeMs) {
                break; // Stop outer loop too
            }
        }

        if (processingQueue.size > 0) {
            isProcessing = true;
            requestAnimationFrame(processQueue);
        } else {
            isProcessing = false;
            // Queue empty, definitely ready
            if (!document.documentElement.dataset.smartDarkReady) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        document.documentElement.dataset.smartDarkReady = 'true';
                    });
                });
            }
        }
    }

    function processNode(node) {
        if (node.nodeType === 1) { // ELEMENT_NODE
            processingQueue.add(node);
            scheduleProcessing();
        }
    }

    function enableDarkMode() {
        if (!isEnabled) isEnabled = true;

        // Reset state for clean switch
        nodesProcessed = 0;
        delete document.documentElement.dataset.smartDarkReady; // Engage curtain

        // Remove processed flags to force re-calculation
        const processed = document.querySelectorAll('[data-smart-dark-processed="true"]');
        if (processed.length > 0) {
            processed.forEach(el => delete el.dataset.smartDarkProcessed);
        }

        // Apply Global Defaults
        document.documentElement.dataset.originalBg = document.documentElement.style.backgroundColor;
        document.documentElement.style.backgroundColor = getThemeColor();
        document.documentElement.style.colorScheme = 'dark';

        const updateBody = () => {
            if (document.body) {
                // Ensure body is covered
                if (!document.body.dataset.originalBg) {
                    document.body.dataset.originalBg = document.body.style.backgroundColor;
                }
                document.body.style.backgroundColor = getThemeColor();

                // Re-ensure dimmer overlay is properly attached and visible
                if (currentDimmerOpacity > 0) {
                    setDimmer(currentDimmerOpacity, false);
                }

                processNode(document.body);
                startObserver();
            }
        };

        if (document.body) {
            updateBody();
        } else {
            document.addEventListener('DOMContentLoaded', updateBody);
        }
    }

    function startObserver() {
        if (!observer && document.body) {
            observer = new MutationObserver((mutations) => {
                if (!isEnabled) return;
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        processNode(node);
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }
    }

    function disableDarkMode() {
        if (!isEnabled) return;
        isEnabled = false;

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        processingQueue.clear();
        document.documentElement.dataset.smartDarkReady = 'true';

        const processed = document.querySelectorAll('[data-smart-dark-processed="true"]');
        processed.forEach(el => {
            if (el.dataset.originalBg !== undefined) {
                el.style.backgroundColor = el.dataset.originalBg;
                delete el.dataset.originalBg;
            } else if (el.style.backgroundColor === getThemeColor() || Object.values(THEMES).some(t => t.color === el.style.backgroundColor)) {
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
        });

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
