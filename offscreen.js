
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PLAY_SOUND') {
        const audio = new Audio(chrome.runtime.getURL(msg.file));
        audio.volume = Math.max(0, Math.min(1, msg.volume ?? 0.4));
        audio.play().catch(() => { });
    }
});
