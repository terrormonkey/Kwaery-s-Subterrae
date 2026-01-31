const THEMES = {
    'obsidian': { color: '#1A1A1B', type: 'dark', name: 'Obsidian' },
    'sandstone': { color: '#D7C9B8', type: 'light', name: 'Sandstone' },
    'midnight-tide': { color: '#0e1f30', type: 'dark', name: 'Midnight Tide' },
    'black-cherry': { color: '#2b0c10', type: 'dark', name: 'Black Cherry' },
    'sunken-reef': { color: '#072929', type: 'dark', name: 'Sunken Reef' }
};

// Export for Node/Tests if needed, but for Chrome Ext, it's just a global variable.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = THEMES;
}
