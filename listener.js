// Track mouse position for dimmer overlay placement
let _terrorMouseX = 0;
let _terrorMouseY = 0;
document.addEventListener('mousemove', (e) => {
  _terrorMouseX = e.clientX;
  _terrorMouseY = e.clientY;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!e.shiftKey) return;

  const active = document.activeElement;
  const isInput = active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.isContentEditable;
  if (isInput) return;

  const key = e.key.toLowerCase();

  // Shift + X → Toggle dark mode
  if (key === 'x') {
    chrome.runtime.sendMessage({ action: 'TOGGLE_REQUEST' });
  }

  // Shift + Y → Toggle dimmer overlay at cursor
  if (key === 'y') {
    window.dispatchEvent(new CustomEvent('terror-toggle-dimmer-overlay', {
      detail: { x: _terrorMouseX, y: _terrorMouseY }
    }));
  }

  // Shift + T → Toggle tutorial overlay
  if (key === 't') {
    window.dispatchEvent(new CustomEvent('terror-toggle-tutorial'));
  }

  // Shift + < → Cycle theme
  if (e.key === '<' || e.key === ',') {
    chrome.runtime.sendMessage({ action: 'CYCLE_THEME' });
  }
});
