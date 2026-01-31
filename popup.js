
document.addEventListener('DOMContentLoaded', () => {
    const toggleInput = document.getElementById('toggle-input');
    const dimmerSlider = document.getElementById('dimmer-slider');
    const dimmerValue = document.getElementById('dimmer-value');
    const themeList = document.getElementById('theme-list');
    const themesHeader = document.getElementById('themes-header');
    const dimmerSitesList = document.getElementById('dimmer-sites-list');
    const dimmerSitesHeader = document.getElementById('dimmer-sites-header');

    let currentDomain = null;

    // Extract root domain from hostname (e.g., en.wikipedia.org -> wikipedia.org)
    function getRootDomain(hostname) {
        const parts = hostname.split('.');
        const knownTLDs = ['co.uk', 'com.br', 'co.jp', 'com.au', 'co.nz', 'org.uk'];
        const lastTwo = parts.slice(-2).join('.');
        if (knownTLDs.includes(lastTwo) && parts.length > 2) {
            return parts.slice(-3).join('.');
        }
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    }

    // Initialize State
    chrome.storage.local.get(['globalEnabled', 'dimmerSites', 'theme'], (data) => {
        toggleInput.checked = !!data.globalEnabled;
        renderThemes(data.theme || 'dark-gray');
        renderDimmerSites(data.dimmerSites || {});

        // Get current tab's domain and dimmer value
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                try {
                    const url = new URL(tabs[0].url);
                    currentDomain = getRootDomain(url.hostname);
                    const opacity = (data.dimmerSites || {})[currentDomain] || 0;
                    dimmerSlider.value = opacity * 100;
                    dimmerValue.textContent = Math.round(opacity * 100) + '%';
                } catch (e) {
                    // Invalid URL (chrome:// etc)
                    dimmerSlider.value = 0;
                    dimmerValue.textContent = '0%';
                }
            }
        });
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
    themesHeader.addEventListener('click', () => {
        const isOpen = themeList.classList.contains('open');
        if (isOpen) {
            themeList.classList.remove('open');
        } else {
            themeList.classList.add('open');
        }
    });

    // Collapsible Dimmer Sites
    dimmerSitesHeader.addEventListener('click', () => {
        const isOpen = dimmerSitesList.classList.contains('open');
        if (isOpen) {
            dimmerSitesList.classList.remove('open');
        } else {
            dimmerSitesList.classList.add('open');
            // Refresh the list when opening
            chrome.storage.local.get({ dimmerSites: {} }, (data) => {
                renderDimmerSites(data.dimmerSites);
            });
        }
    });

    // Right-click Easter Egg (Global)
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const egg = document.createElement('div');
        egg.className = 'easter-egg';
        egg.textContent = "u cant rightclick here :o";
        egg.style.visibility = 'hidden';

        document.body.appendChild(egg);

        const rect = egg.getBoundingClientRect();
        let left = e.clientX;
        let top = e.clientY;

        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - 10;
        }
        if (left < 0) left = 5;

        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 5;
        }

        egg.style.left = left + 'px';
        egg.style.top = top + 'px';
        egg.style.visibility = 'visible';

        setTimeout(() => {
            if (document.body.contains(egg)) {
                document.body.removeChild(egg);
            }
        }, 2000);
    });

    // Dimmer Logic
    dimmerSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        dimmerValue.textContent = Math.round(val * 100) + '%';

        // Send to active tab for immediate preview and storage
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // Catch error if tab is restricted (chrome://) or content script not ready
                chrome.tabs.sendMessage(tabs[0].id, { action: 'SET_DIMMER', value: val })
                    .catch(() => { /* Ignore connection errors on restricted pages */ });
            }
        });
    });

    // Render Dimmer Sites List
    function renderDimmerSites(sites) {
        dimmerSitesList.innerHTML = '';
        const siteKeys = Object.keys(sites);

        if (siteKeys.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.padding = '10px';
            emptyMsg.style.color = '#666';
            emptyMsg.style.fontSize = '11px';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.textContent = 'No dimmed sites yet';
            dimmerSitesList.appendChild(emptyMsg);
            return;
        }

        siteKeys.sort().forEach(domain => {
            const opacity = sites[domain];
            const item = document.createElement('div');
            item.className = 'dimmer-site-item';

            const info = document.createElement('span');
            info.textContent = `${domain} (${Math.round(opacity * 100)}%)`;
            info.style.overflow = 'hidden';
            info.style.textOverflow = 'ellipsis';
            info.style.whiteSpace = 'nowrap';
            item.appendChild(info);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'dimmer-site-delete';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Remove dimmer for this site';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                item.classList.add('removing');
                setTimeout(() => {
                    // Remove from storage
                    chrome.storage.local.get({ dimmerSites: {} }, (data) => {
                        const updatedSites = data.dimmerSites;
                        delete updatedSites[domain];
                        chrome.storage.local.set({ dimmerSites: updatedSites }, () => {
                            renderDimmerSites(updatedSites);
                            // If this was the current domain, reset slider
                            if (domain === currentDomain) {
                                dimmerSlider.value = 0;
                                dimmerValue.textContent = '0%';
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

        if (typeof THEMES !== 'undefined') {
            Object.keys(THEMES).forEach(key => {
                const theme = THEMES[key];
                const isSelected = key === selectedKey;

                const item = document.createElement('div');
                item.style.padding = '5px 10px';
                item.style.backgroundColor = isSelected ? '#444' : 'transparent';
                item.style.cursor = 'pointer';
                item.style.borderRadius = '4px';
                item.style.display = 'flex';
                item.style.alignItems = 'center';

                // Color swatch
                const swatch = document.createElement('span');
                swatch.style.width = '12px';
                swatch.style.height = '12px';
                swatch.style.backgroundColor = theme.color;
                swatch.style.display = 'inline-block';
                swatch.style.marginRight = '8px';
                swatch.style.border = '1px solid #666';
                item.appendChild(swatch);

                const text = document.createElement('span');
                text.textContent = theme.name + (isSelected ? ' (selected)' : '');
                text.style.fontSize = '12px';
                if (isSelected) text.style.fontWeight = 'bold';
                item.appendChild(text);

                item.addEventListener('click', () => {
                    chrome.storage.local.set({ theme: key });
                    renderThemes(key); // Re-render to update selection
                });

                item.addEventListener('mouseover', () => {
                    if (key !== selectedKey) item.style.backgroundColor = '#333';
                });
                item.addEventListener('mouseout', () => {
                    if (key !== selectedKey) item.style.backgroundColor = 'transparent';
                });

                themeList.appendChild(item);
            });
        }
    }
});
