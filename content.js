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
        } else if (request.action === 'TOGGLE_TUTORIAL') {
            toggleTutorialOverlay();
        } else if (request.action === 'CLOSE_TUTORIAL') {
            hideTutorialOverlay();
        } else if (request.action === 'UPDATE_TUTORIAL_LANG') {
            if (isTutorialVisible()) {
                buildTutorialContent(request.language);
                // Keep it visible after rebuild
                tutorialBackdrop.style.opacity = '1';
                tutorialBackdrop.style.pointerEvents = 'auto';
                tutorialOverlay.style.display = 'block';
                tutorialOverlay.style.opacity = '1';
                tutorialOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
                tutorialOverlay.style.pointerEvents = 'auto';
            }
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

    // ── Dimmer Slider Overlay (Shift+Y) ──
    let dimmerSliderOverlay = null;
    let dimmerSliderAutoHide = null;

    function createDimmerSliderOverlay() {
        if (dimmerSliderOverlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'terror-dimmer-slider-overlay';
        overlay.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            background: rgba(10, 10, 10, 0.92);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 12px 18px;
            display: flex;
            align-items: center;
            gap: 12px;
            opacity: 0;
            transform: scale(0.92) translateY(4px);
            transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            user-select: none;
            -webkit-user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        `;

        const label = document.createElement('span');
        label.textContent = 'Dimmer';
        label.style.cssText = 'color: rgba(255,255,255,0.5); font-size: 11px; font-weight: 600; letter-spacing: 0.03em; white-space: nowrap;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '90';
        slider.value = String(Math.round(currentDimmerOpacity * 100));
        slider.style.cssText = `
            -webkit-appearance: none;
            appearance: none;
            width: 140px;
            height: 4px;
            background: linear-gradient(to right, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.35) ${slider.value / 90 * 100}%, #1a1a1a ${slider.value / 90 * 100}%, #1a1a1a 100%);
            border-radius: 4px;
            outline: none;
            cursor: pointer;
        `;

        // Webkit thumb styling via stylesheet injection
        const thumbCSS = document.createElement('style');
        thumbCSS.textContent = `
            #terror-dimmer-slider-overlay input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                background: #fff;
                border-radius: 50%;
                cursor: pointer;
                border: none;
                box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
                transition: box-shadow 0.2s ease, transform 0.15s ease;
            }
            #terror-dimmer-slider-overlay input[type=range]::-webkit-slider-thumb:hover {
                box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.15);
                transform: scale(1.1);
            }
        `;

        const pct = document.createElement('span');
        pct.textContent = Math.round(currentDimmerOpacity * 100) + '%';
        pct.style.cssText = 'color: rgba(255,255,255,0.35); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 28px; text-align: right;';

        slider.addEventListener('input', () => {
            const val = parseInt(slider.value) / 100;
            pct.textContent = Math.round(val * 100) + '%';
            const trackPct = (slider.value / 90) * 100;
            slider.style.background = `linear-gradient(to right, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.35) ${trackPct}%, #1a1a1a ${trackPct}%, #1a1a1a 100%)`;
            setDimmer(val, true);
            resetAutoHide();
        });

        overlay.appendChild(thumbCSS);
        overlay.appendChild(label);
        overlay.appendChild(slider);
        overlay.appendChild(pct);

        overlay._slider = slider;
        overlay._pct = pct;

        document.documentElement.appendChild(overlay);
        dimmerSliderOverlay = overlay;
    }

    function showDimmerSliderOverlay(x, y) {
        if (!dimmerSliderOverlay) createDimmerSliderOverlay();

        // Update current value
        const val = Math.round(currentDimmerOpacity * 100);
        dimmerSliderOverlay._slider.value = String(val);
        dimmerSliderOverlay._pct.textContent = val + '%';
        const trackPct = (val / 90) * 100;
        dimmerSliderOverlay._slider.style.background = `linear-gradient(to right, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.35) ${trackPct}%, #1a1a1a ${trackPct}%, #1a1a1a 100%)`;

        // Make visible to measure
        dimmerSliderOverlay.style.display = 'flex';
        dimmerSliderOverlay.style.opacity = '0';

        requestAnimationFrame(() => {
            const rect = dimmerSliderOverlay.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 8;

            // Default: above cursor, centered horizontally
            let left = x - rect.width / 2;
            let top = y - rect.height - 10;

            // Edge: too far up → show below cursor
            if (top < margin) {
                top = y + 20;
            }
            // Edge: too far down (below cursor fallback) → clamp
            if (top + rect.height > vh - margin) {
                top = vh - rect.height - margin;
            }
            // Edge: too far left
            if (left < margin) {
                left = margin;
            }
            // Edge: too far right
            if (left + rect.width > vw - margin) {
                left = vw - rect.width - margin;
            }

            dimmerSliderOverlay.style.left = left + 'px';
            dimmerSliderOverlay.style.top = top + 'px';

            // Fade in
            requestAnimationFrame(() => {
                dimmerSliderOverlay.style.opacity = '1';
                dimmerSliderOverlay.style.transform = 'scale(1) translateY(0)';
            });
        });

        resetAutoHide();
    }

    function hideDimmerSliderOverlay() {
        if (!dimmerSliderOverlay) return;
        dimmerSliderOverlay.style.opacity = '0';
        dimmerSliderOverlay.style.transform = 'scale(0.92) translateY(4px)';
        clearAutoHide();
        setTimeout(() => {
            if (dimmerSliderOverlay) dimmerSliderOverlay.style.display = 'none';
        }, 200);
    }

    function isDimmerSliderVisible() {
        return dimmerSliderOverlay && dimmerSliderOverlay.style.display !== 'none' && dimmerSliderOverlay.style.opacity !== '0';
    }

    function resetAutoHide() {
        clearAutoHide();
        dimmerSliderAutoHide = setTimeout(hideDimmerSliderOverlay, 3500);
    }

    function clearAutoHide() {
        if (dimmerSliderAutoHide) {
            clearTimeout(dimmerSliderAutoHide);
            dimmerSliderAutoHide = null;
        }
    }

    // Listen for Shift+Y event from listener.js
    window.addEventListener('terror-toggle-dimmer-overlay', (e) => {
        if (isDimmerSliderVisible()) {
            hideDimmerSliderOverlay();
        } else {
            showDimmerSliderOverlay(e.detail.x, e.detail.y);
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDimmerSliderVisible()) {
            hideDimmerSliderOverlay();
        }
    });

    // Close on click outside
    document.addEventListener('mousedown', (e) => {
        if (isDimmerSliderVisible() && dimmerSliderOverlay && !dimmerSliderOverlay.contains(e.target)) {
            hideDimmerSliderOverlay();
        }
    });

    // Keep overlay alive while hovering/interacting
    if (typeof MutationObserver !== 'undefined') {
        // Will be set up after overlay is created
        const setupHoverKeepAlive = () => {
            if (!dimmerSliderOverlay) return;
            dimmerSliderOverlay.addEventListener('mouseenter', resetAutoHide);
            dimmerSliderOverlay.addEventListener('mousemove', resetAutoHide);
        };
        // Hook into createDimmerSliderOverlay completion
        const origCreate = createDimmerSliderOverlay;
        createDimmerSliderOverlay = function () {
            origCreate();
            setupHoverKeepAlive();
        };
    }

    // ── Tutorial Overlay (Shift+T) ──
    let tutorialOverlay = null;
    let tutorialBackdrop = null;

    const TUTORIAL_TEXTS = {
        en: {
            title: 'Tutorial',
            darkMode: 'Toggles dark mode for the current site. Each site stores its own state independently. Use the switch in the popup or press <span class="tt-key">Shift + X</span> on any page.',
            dimmer: 'Darkens the page with a black overlay. Drag the slider to set intensity (0\u201390%). Each site has its own dimmer value. Press <span class="tt-key">Shift + Y</span> to open a quick-adjust slider near your cursor.',
            themes: 'Changes which background color dark mode applies. Choose from the list in the popup or press <span class="tt-key">Shift + &lt;</span> to cycle through all themes. The selected theme applies globally across all sites.',
            sites: 'Shows all sites with active settings. Each entry displays the domain, current dimmer percentage, and dark mode status. Click the \u00D7 button to remove all settings for a site.',
            shortcuts: '<span class="tt-key">Shift + X</span> Toggle dark mode<br><span class="tt-key">Shift + Y</span> Dimmer slider at cursor<br><span class="tt-key">Shift + T</span> Open / close this tutorial<br><span class="tt-key">Shift + &lt;</span> Cycle theme<br>All shortcuts are disabled while typing in text fields.'
        },
        de: {
            title: 'Tutorial',
            darkMode: 'Aktiviert Dark Mode f\u00FCr die aktuelle Seite. Jede Seite speichert ihren Status unabh\u00E4ngig. Nutze den Schalter im Popup oder dr\u00FCcke <span class="tt-key">Shift + X</span> auf jeder Seite.',
            dimmer: 'Verdunkelt die Seite mit einem schwarzen Overlay. Ziehe den Slider um die Intensit\u00E4t einzustellen (0\u201390%). Jede Seite hat ihren eigenen Dimmer-Wert. Dr\u00FCcke <span class="tt-key">Shift + Y</span> um einen Slider an deinem Cursor zu \u00F6ffnen.',
            themes: '\u00C4ndert die Hintergrundfarbe die Dark Mode anwendet. W\u00E4hle aus der Liste im Popup oder dr\u00FCcke <span class="tt-key">Shift + &lt;</span> um durch alle Themes zu wechseln. Das ausgew\u00E4hlte Theme gilt global f\u00FCr alle Seiten.',
            sites: 'Zeigt alle Seiten mit aktiven Einstellungen. Jeder Eintrag zeigt die Domain, den aktuellen Dimmer-Wert und den Dark Mode Status. Klicke auf \u00D7 um alle Einstellungen f\u00FCr eine Seite zu entfernen.',
            shortcuts: '<span class="tt-key">Shift + X</span> Dark Mode umschalten<br><span class="tt-key">Shift + Y</span> Dimmer-Slider am Cursor<br><span class="tt-key">Shift + T</span> Tutorial \u00F6ffnen / schlie\u00DFen<br><span class="tt-key">Shift + &lt;</span> Theme wechseln<br>Alle Shortcuts sind beim Tippen in Textfeldern deaktiviert.'
        }
    };

    function buildTutorialContent(lang) {
        const t = TUTORIAL_TEXTS[lang] || TUTORIAL_TEXTS.en;

        // Remove old overlay if exists
        if (tutorialOverlay) {
            tutorialOverlay.remove();
            tutorialOverlay = null;
        }
        if (tutorialBackdrop) {
            tutorialBackdrop.remove();
            tutorialBackdrop = null;
        }

        // Backdrop
        tutorialBackdrop = document.createElement('div');
        tutorialBackdrop.id = 'terror-tutorial-backdrop';
        tutorialBackdrop.style.cssText = `
            position: fixed; inset: 0; z-index: 2147483646;
            background: rgba(0, 0, 0, 0.6);
            opacity: 0;
            transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
        `;
        tutorialBackdrop.addEventListener('click', hideTutorialOverlay);

        // Modal
        const modal = document.createElement('div');
        modal.id = 'terror-tutorial-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%) scale(0.92);
            z-index: 2147483647;
            background: rgba(10, 10, 10, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 0;
            width: 340px;
            max-height: 520px;
            overflow-y: auto;
            opacity: 0;
            transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            color: #e8e8e8;
        `;

        const scrollCSS = document.createElement('style');
        scrollCSS.textContent = `
            #terror-tutorial-overlay::-webkit-scrollbar { width: 3px; }
            #terror-tutorial-overlay::-webkit-scrollbar-track { background: transparent; }
            #terror-tutorial-overlay::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
            #terror-tutorial-overlay .tt-key {
                display: inline; font-size: 10px; font-weight: 600;
                color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.06);
                padding: 1px 6px; border-radius: 4px;
                border: 1px solid rgba(255,255,255,0.08);
                font-family: 'SF Mono','Consolas','Menlo',monospace;
            }
        `;
        modal.appendChild(scrollCSS);

        // Support banner
        const support = document.createElement('a');
        support.href = 'https://ko-fi.com/kwaery';
        support.target = '_blank';
        support.rel = 'noopener noreferrer';
        support.textContent = 'Support!';
        support.style.cssText = `
            display: block; text-align: center; padding: 10px 22px;
            font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.6);
            background: rgba(255,255,255,0.04);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            text-decoration: none; letter-spacing: 0.03em; cursor: pointer;
            transition: background 0.2s ease, color 0.2s ease;
            border-radius: 16px 16px 0 0;
        `;
        support.addEventListener('mouseenter', () => { support.style.background = 'rgba(255,255,255,0.08)'; support.style.color = '#fff'; });
        support.addEventListener('mouseleave', () => { support.style.background = 'rgba(255,255,255,0.04)'; support.style.color = 'rgba(255,255,255,0.6)'; });
        modal.appendChild(support);

        const content = document.createElement('div');
        content.style.cssText = 'padding: 20px 24px;';

        const title = document.createElement('div');
        title.textContent = t.title;
        title.style.cssText = 'font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 16px; letter-spacing: 0.01em;';
        content.appendChild(title);

        function addSection(heading, text) {
            const sec = document.createElement('div');
            sec.style.cssText = 'margin-bottom: 14px;';
            const h = document.createElement('div');
            h.textContent = heading;
            h.style.cssText = 'font-size: 11.5px; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 5px; letter-spacing: 0.03em;';
            sec.appendChild(h);
            const p = document.createElement('div');
            p.innerHTML = text;
            p.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.42); line-height: 1.6; font-weight: 450;';
            sec.appendChild(p);
            content.appendChild(sec);
        }

        function addDivider() {
            const d = document.createElement('div');
            d.style.cssText = 'height: 1px; background: rgba(255,255,255,0.05); margin: 12px 0;';
            content.appendChild(d);
        }

        addSection('Dark Mode', t.darkMode); addDivider();
        addSection('Dimmer', t.dimmer); addDivider();
        addSection('Themes', t.themes); addDivider();
        addSection('Sites', t.sites); addDivider();
        addSection('Shortcuts', t.shortcuts);

        modal.appendChild(content);
        document.documentElement.appendChild(tutorialBackdrop);
        document.documentElement.appendChild(modal);
        tutorialOverlay = modal;
    }

    function showTutorialOverlay() {
        // Notify background to close tutorial on other tabs
        chrome.runtime.sendMessage({ action: 'TUTORIAL_OPENING' }).catch(() => { });

        // Rebuild with current language
        chrome.storage.local.get({ language: 'en' }, (data) => {
            buildTutorialContent(data.language);
            tutorialBackdrop.style.pointerEvents = 'auto';
            tutorialOverlay.style.display = 'block';
            requestAnimationFrame(() => {
                tutorialBackdrop.style.opacity = '1';
                tutorialOverlay.style.opacity = '1';
                tutorialOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
                tutorialOverlay.style.pointerEvents = 'auto';
            });
        });
    }

    function hideTutorialOverlay() {
        if (!tutorialOverlay) return;
        tutorialBackdrop.style.opacity = '0';
        tutorialBackdrop.style.pointerEvents = 'none';
        tutorialOverlay.style.opacity = '0';
        tutorialOverlay.style.transform = 'translate(-50%, -50%) scale(0.92)';
        tutorialOverlay.style.pointerEvents = 'none';

        // Play 17.flac when closing tutorial
        chrome.storage.local.get({ soundVolumePercent: 30 }, (data) => {
            const trueVol = (data.soundVolumePercent / 100) * 0.25;
            if (trueVol > 0) {
                const audio = new Audio(chrome.runtime.getURL('Sounds/17.flac'));
                audio.volume = trueVol;
                audio.play().catch(() => { });
            }
        });

        setTimeout(() => {
            if (tutorialOverlay) tutorialOverlay.style.display = 'none';
        }, 200);
    }

    function isTutorialVisible() {
        return tutorialOverlay && tutorialOverlay.style.display !== 'none' && tutorialOverlay.style.opacity !== '0';
    }

    function toggleTutorialOverlay() {
        if (isTutorialVisible()) {
            hideTutorialOverlay();
        } else {
            showTutorialOverlay();
        }
    }

    // Listen for Shift+T event from listener.js
    window.addEventListener('terror-toggle-tutorial', toggleTutorialOverlay);

    // Close tutorial on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isTutorialVisible()) {
            hideTutorialOverlay();
        }
    });

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
