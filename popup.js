document.addEventListener('DOMContentLoaded', () => {
    const toggleInput = document.getElementById('toggle-input');
    const dimmerSlider = document.getElementById('dimmer-slider');
    const dimmerValue = document.getElementById('dimmer-value');
    const themeList = document.getElementById('theme-list');
    const themesHeader = document.getElementById('themes-header');
    const dimmerSitesList = document.getElementById('dimmer-sites-list');
    const dimmerSitesHeader = document.getElementById('dimmer-sites-header');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValueEl = document.getElementById('volume-value');

    let currentDomain = null;
    let currentLang = 'en';
    let soundVolumePercent = 30; // 0-100 UI value

    // ── Sound System ──
    function getTrueVolume() {
        // Map 0-100% UI to 0.0-0.25 true volume
        return (soundVolumePercent / 100) * 0.25;
    }

    function playSound(file) {
        const trueVol = getTrueVolume();
        if (trueVol <= 0) return;
        const audio = new Audio(chrome.runtime.getURL(`Sounds/${file}`));
        audio.volume = trueVol;
        audio.play().catch(() => { });
    }

    // Connect port to background so it can detect popup close
    const port = chrome.runtime.connect({ name: 'popup' });

    // Hover sounds on menu-items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            playSound('12.flac');
        });
    });

    // Hover sounds on language buttons individually
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            playSound('12.flac');
        });
    });

    // Click sound helper
    function attachClickSound(el) {
        if (!el) return;
        el.addEventListener('click', () => {
            playSound('14.flac');
        });
    }

    attachClickSound(document.getElementById('toggle-item'));
    attachClickSound(document.getElementById('dimmer-sites-section'));
    attachClickSound(document.getElementById('themes-section'));
    attachClickSound(document.getElementById('lang-en'));
    attachClickSound(document.getElementById('lang-de'));

    dimmerSlider.addEventListener('change', () => {
        playSound('14.flac');
    });

    // ── Translations ──
    const TRANSLATIONS = {
        en: {
            darkMode: 'Dark Mode',
            dimmer: 'Dimmer',
            tutorial: 'Tutorial',
            themes: 'Themes',
            sites: 'Sites',
            language: 'Language & Sound',
            noSites: 'No configured sites yet',
            removeSite: 'Remove settings for this site',
            volume: 'Volume'
        },
        de: {
            darkMode: 'Dark Mode',
            dimmer: 'Dimmer',
            tutorial: 'Tutorial',
            themes: 'Themes',
            sites: 'Seiten',
            language: 'Sprache & Sound',
            noSites: 'Noch keine Seiten konfiguriert',
            removeSite: 'Einstellungen entfernen',
            volume: 'Lautstärke'
        }
    };

    function applyLanguage(lang) {
        currentLang = lang;
        const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

        document.querySelector('#toggle-item .label').textContent = t.darkMode;
        document.querySelector('#dimmer-section .label').textContent = t.dimmer;
        document.querySelector('#tutorial-section .label').textContent = t.tutorial;
        document.querySelector('#themes-section .label').textContent = t.themes;
        document.querySelector('#dimmer-sites-section .label').textContent = t.sites;
        document.getElementById('language-label').textContent = t.language;
        document.getElementById('volume-label').textContent = t.volume;

        document.getElementById('lang-en').classList.toggle('active', lang === 'en');
        document.getElementById('lang-de').classList.toggle('active', lang === 'de');

        chrome.storage.local.get({ siteSettings: {} }, (data) => {
            renderSitesList(data.siteSettings);
        });
    }

    function getRootDomain(hostname) {
        const parts = hostname.split('.');
        const knownTLDs = ['co.uk', 'com.br', 'co.jp', 'com.au', 'co.nz', 'org.uk'];
        const lastTwo = parts.slice(-2).join('.');
        if (knownTLDs.includes(lastTwo) && parts.length > 2) return parts.slice(-3).join('.');
        return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    }

    // Initialize State
    chrome.storage.local.get(['siteSettings', 'theme', 'language', 'soundVolumePercent'], (data) => {
        const settings = data.siteSettings || {};
        currentLang = data.language || 'en';

        // Volume logic
        if (data.soundVolumePercent !== undefined) {
            soundVolumePercent = data.soundVolumePercent;
        } else {
            soundVolumePercent = 30; // default 30%
        }

        volumeSlider.value = soundVolumePercent;
        volumeValueEl.textContent = soundVolumePercent + '%';
        updateSliderTrack(volumeSlider);

        // Play open sound based on initial scale
        playSound('13.flac');

        renderThemes(data.theme || 'obsidian');
        applyLanguage(currentLang);
        renderSitesList(settings);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                try {
                    const url = new URL(tabs[0].url);
                    currentDomain = getRootDomain(url.hostname);
                    const siteConfig = settings[currentDomain] || { dimmer: 0, darkMode: false };

                    toggleInput.checked = !!siteConfig.darkMode;
                    dimmerSlider.value = (siteConfig.dimmer || 0) * 100;
                    dimmerValue.textContent = Math.round((siteConfig.dimmer || 0) * 100) + '%';
                    updateSliderTrack(dimmerSlider);
                } catch (e) {
                    toggleInput.checked = false;
                    dimmerSlider.value = 0;
                    dimmerValue.textContent = '0%';
                    updateSliderTrack(dimmerSlider);
                }
            }
        });
    });

    function updateSliderTrack(slider) {
        const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.background = `linear-gradient(to right, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.35) ${pct}%, #1a1a1a ${pct}%, #1a1a1a 100%)`;
    }

    // ── Volume Slider ──
    volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        soundVolumePercent = val;
        volumeValueEl.textContent = val + '%';
        updateSliderTrack(e.target);
        chrome.storage.local.set({ soundVolumePercent: val });
    });

    // Toggle Dark Mode
    toggleInput.addEventListener('change', () => {
        chrome.runtime.sendMessage({ action: 'TOGGLE_FROM_POPUP' }).catch(() => { });
    });

    document.getElementById('toggle-item').addEventListener('click', (e) => {
        if (e.target !== toggleInput && e.target.className !== 'slider') {
            toggleInput.checked = !toggleInput.checked;
            toggleInput.dispatchEvent(new Event('change'));
        }
    });

    // Collapsible Themes
    document.getElementById('themes-section').addEventListener('click', (e) => {
        if (e.target.closest('.theme-item')) return;
        const isOpen = themeList.classList.toggle('open');
        themesHeader.classList.toggle('open', isOpen);
    });

    // Collapsible Sites List
    document.getElementById('dimmer-sites-section').addEventListener('click', (e) => {
        if (e.target.closest('.site-item')) return;
        const isOpen = dimmerSitesList.classList.toggle('open');
        dimmerSitesHeader.classList.toggle('open', isOpen);
        if (isOpen) {
            chrome.storage.local.get({ siteSettings: {} }, (data) => {
                renderSitesList(data.siteSettings);
            });
        }
    });

    // ── Tutorial Click (also closes popup) ──
    const tutorialSection = document.getElementById('tutorial-section');
    tutorialSection.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_TUTORIAL' }).catch(() => { });
                // Play tutorial sound
                playSound('tutorial.flac');
                // The popup no longer closes automatically
            }
        });
    });

    // Language Selector
    function setLanguage(lang) {
        chrome.storage.local.set({ language: lang });
        applyLanguage(lang);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'UPDATE_TUTORIAL_LANG', language: lang }).catch(() => { });
            }
        });
    }

    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));
    document.getElementById('lang-de').addEventListener('click', () => setLanguage('de'));

    // Easter Egg
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const egg = document.createElement('div');
        egg.className = 'easter-egg';
        egg.textContent = "u cant rightclick here :o";
        egg.style.visibility = 'hidden';
        document.body.appendChild(egg);

        const rect = egg.getBoundingClientRect();
        let left = Math.min(e.clientX, window.innerWidth - rect.width - 10);
        let top = Math.min(e.clientY, window.innerHeight - rect.height - 5);
        if (left < 0) left = 5;

        egg.style.left = left + 'px';
        egg.style.top = top + 'px';
        egg.style.visibility = 'visible';

        setTimeout(() => {
            if (document.body.contains(egg)) document.body.removeChild(egg);
        }, 2000);
    });

    // Dimmer Logic
    dimmerSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        dimmerValue.textContent = Math.round(val * 100) + '%';
        updateSliderTrack(e.target);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'SET_DIMMER', value: val })
                    .catch(() => { });
            }
        });
    });

    // Render Sites List
    function renderSitesList(settings) {
        dimmerSitesList.innerHTML = '';
        const domains = Object.keys(settings).sort();
        const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

        if (domains.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-message';
            emptyMsg.textContent = t.noSites;
            dimmerSitesList.appendChild(emptyMsg);
            return;
        }

        domains.forEach(domain => {
            const config = settings[domain];
            const dimmer = config.dimmer || 0;
            const darkMode = !!config.darkMode;

            const item = document.createElement('div');
            item.className = 'site-item';

            const domainSpan = document.createElement('span');
            domainSpan.className = 'site-domain';
            domainSpan.textContent = domain;
            domainSpan.title = domain;
            item.appendChild(domainSpan);

            const dimmerSpan = document.createElement('span');
            dimmerSpan.className = 'site-dimmer';
            dimmerSpan.textContent = Math.round(dimmer * 100) + '%';
            item.appendChild(dimmerSpan);

            const dmSpan = document.createElement('span');
            dmSpan.className = 'site-dm ' + (darkMode ? 'on' : 'off');
            dmSpan.textContent = darkMode ? 'DM: ON' : 'DM: OFF';
            item.appendChild(dmSpan);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'site-delete';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = t.removeSite;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playSound('14.flac');
                item.classList.add('removing');
                setTimeout(() => {
                    chrome.storage.local.get({ siteSettings: {} }, (data) => {
                        const updated = data.siteSettings;
                        delete updated[domain];
                        chrome.storage.local.set({ siteSettings: updated }, () => {
                            renderSitesList(updated);
                            if (domain === currentDomain) {
                                toggleInput.checked = false;
                                dimmerSlider.value = 0;
                                dimmerValue.textContent = '0%';
                                updateSliderTrack(dimmerSlider);
                            }
                        });
                    });
                }, 300);
            });
            item.appendChild(deleteBtn);

            dimmerSitesList.appendChild(item);
        });
    }

    // Theme Logic
    function renderThemes(selectedKey) {
        themeList.innerHTML = '';
        if (typeof THEMES === 'undefined') return;

        Object.keys(THEMES).forEach(key => {
            const theme = THEMES[key];
            const isSelected = key === selectedKey;

            const item = document.createElement('div');
            item.className = 'theme-item' + (isSelected ? ' selected' : '');

            const swatch = document.createElement('span');
            swatch.className = 'theme-swatch';
            swatch.style.backgroundColor = theme.color;
            item.appendChild(swatch);

            const text = document.createElement('span');
            text.className = 'theme-name';
            text.textContent = theme.name;
            item.appendChild(text);

            const check = document.createElement('span');
            check.className = 'theme-check';
            check.textContent = '\u2713';
            item.appendChild(check);

            item.addEventListener('click', () => {
                playSound('14.flac');
                chrome.storage.local.set({ theme: key });
                renderThemes(key);
            });

            themeList.appendChild(item);
        });
    }
});
