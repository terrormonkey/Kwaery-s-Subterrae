
document.addEventListener('DOMContentLoaded', () => {
    const toggleInput = document.getElementById('toggle-input');
    const dimmerSlider = document.getElementById('dimmer-slider');
    const dimmerValue = document.getElementById('dimmer-value');
    const themeList = document.getElementById('theme-list');
    const themesHeader = document.getElementById('themes-header');
    const dimmerSitesList = document.getElementById('dimmer-sites-list');
    const dimmerSitesHeader = document.getElementById('dimmer-sites-header');

    let currentDomain = null;

    function getRootDomain(hostname) {
        const parts = hostname.split('.');
        const knownTLDs = ['co.uk', 'com.br', 'co.jp', 'com.au', 'co.nz', 'org.uk'];
        const lastTwo = parts.slice(-2).join('.');
        if (knownTLDs.includes(lastTwo) && parts.length > 2) return parts.slice(-3).join('.');
        return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    }

    // Initialize State (per-site)
    chrome.storage.local.get(['siteSettings', 'theme'], (data) => {
        const settings = data.siteSettings || {};
        renderThemes(data.theme || 'obsidian');
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

    // Toggle Dark Mode (per-site via background)
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
    themesHeader.addEventListener('click', () => {
        const isOpen = themeList.classList.toggle('open');
        themesHeader.classList.toggle('open', isOpen);
    });

    // Collapsible Sites List
    dimmerSitesHeader.addEventListener('click', () => {
        const isOpen = dimmerSitesList.classList.toggle('open');
        dimmerSitesHeader.classList.toggle('open', isOpen);
        if (isOpen) {
            chrome.storage.local.get({ siteSettings: {} }, (data) => {
                renderSitesList(data.siteSettings);
            });
        }
    });

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

    // Dimmer Logic (per-site)
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

    // Render Sites List (combined: dimmer + dark mode status)
    function renderSitesList(settings) {
        dimmerSitesList.innerHTML = '';
        const domains = Object.keys(settings).sort();

        if (domains.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-message';
            emptyMsg.textContent = 'No configured sites yet';
            dimmerSitesList.appendChild(emptyMsg);
            return;
        }

        domains.forEach(domain => {
            const config = settings[domain];
            const dimmer = config.dimmer || 0;
            const darkMode = !!config.darkMode;

            const item = document.createElement('div');
            item.className = 'site-item';

            // Domain name
            const domainSpan = document.createElement('span');
            domainSpan.className = 'site-domain';
            domainSpan.textContent = domain;
            domainSpan.title = domain;
            item.appendChild(domainSpan);

            // Dimmer %
            const dimmerSpan = document.createElement('span');
            dimmerSpan.className = 'site-dimmer';
            dimmerSpan.textContent = Math.round(dimmer * 100) + '%';
            item.appendChild(dimmerSpan);

            // DM status
            const dmSpan = document.createElement('span');
            dmSpan.className = 'site-dm ' + (darkMode ? 'on' : 'off');
            dmSpan.textContent = darkMode ? 'DM: ON' : 'DM: OFF';
            item.appendChild(dmSpan);

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'site-delete';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Remove settings for this site';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
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
            check.textContent = '✓';
            item.appendChild(check);

            item.addEventListener('click', () => {
                chrome.storage.local.set({ theme: key });
                renderThemes(key);
            });

            themeList.appendChild(item);
        });
    }
});
