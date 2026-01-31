// Save options to chrome.storage
function saveOptions() {
  const selectedRadio = document.querySelector('input[name="theme"]:checked');
  const theme = selectedRadio ? selectedRadio.value : 'dark-gray';
  const imageDimming = document.getElementById('imageDimming').checked;

  chrome.storage.local.set({
    theme: theme,
    imageDimming: imageDimming
  }, function () {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.style.opacity = '1';
    setTimeout(function () {
      status.style.opacity = '0';
    }, 1500);
  });
}

// Generate radio buttons and restore state
function restoreOptions() {
  const container = document.getElementById('theme-group');

  // Generate Radio Buttons
  // Use THEMES global variable
  if (typeof THEMES !== 'undefined') {
    Object.keys(THEMES).forEach(key => {
      const theme = THEMES[key];

      const label = document.createElement('label');

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'theme';
      input.value = key;

      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + theme.name));

      container.appendChild(label);
    });
  }

  chrome.storage.local.get({
    theme: 'dark-gray',
    imageDimming: true
  }, function (items) {
    // Set Theme
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    let matched = false;
    for (const radio of themeRadios) {
      if (radio.value === items.theme) {
        radio.checked = true;
        matched = true;
        break;
      }
    }
    // Fallback if theme not found
    if (!matched && themeRadios.length > 0) {
      themeRadios[0].checked = true;
    }

    // Set Image Dimming
    document.getElementById('imageDimming').checked = items.imageDimming;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
