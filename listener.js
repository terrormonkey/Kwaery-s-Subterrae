// Listen for Shift + X to toggle dark mode
document.addEventListener('keydown', (e) => {
  if (e.shiftKey && e.key.toLowerCase() === 'x') {
    // Check if user is typing in an input
    const active = document.activeElement;
    const isInput = active.tagName === 'INPUT' ||
                    active.tagName === 'TEXTAREA' ||
                    active.isContentEditable;

    if (!isInput) {
      // Send toggle request to background
      chrome.runtime.sendMessage({ action: 'TOGGLE_REQUEST' });
    }
  }
});
