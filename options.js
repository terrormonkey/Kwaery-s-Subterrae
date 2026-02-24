// Save options to chrome.storage
function saveOptions() {
  const selectedRadio = document.querySelector('input[name="theme"]:checked');
  const theme = selectedRadio ? selectedRadio.value : 'obsidian';

  chrome.storage.local.set({ theme: theme }, function () {
    const status = document.getElementById('status');
    status.classList.add('visible');
    setTimeout(function () {
      status.classList.remove('visible');
    }, 1500);
  });
}

// Generate radio buttons and restore state
function restoreOptions() {
  const container = document.getElementById('theme-group');

  if (typeof THEMES !== 'undefined') {
    Object.keys(THEMES).forEach(key => {
      const theme = THEMES[key];

      const label = document.createElement('label');
      label.className = 'radio-label';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'theme';
      input.value = key;

      const dot = document.createElement('span');
      dot.className = 'radio-dot';

      const text = document.createTextNode(theme.name);

      label.appendChild(input);
      label.appendChild(dot);
      label.appendChild(text);

      container.appendChild(label);
    });
  }

  chrome.storage.local.get({ theme: 'obsidian' }, function (items) {
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    let matched = false;
    for (const radio of themeRadios) {
      if (radio.value === items.theme) {
        radio.checked = true;
        matched = true;
        break;
      }
    }
    if (!matched && themeRadios.length > 0) {
      themeRadios[0].checked = true;
    }
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
