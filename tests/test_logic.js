// Mock minimal DOM environment
const global = {
    isEnabled: true,
    currentTheme: 'dark-gray',
    window: {
        getComputedStyle: (el) => el.computedStyle || { backgroundColor: '', color: '' }
    }
};

// Mock Element class
class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.nodeType = 1;
        this.style = {};
        this.dataset = {};
        this.computedStyle = { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' }; // Default white bg, black text
        this.children = [];
    }

    querySelectorAll(selector) {
        return this.children;
    }

    appendChild(child) {
        this.children.push(child);
    }
}

// Logic Functions (Copied for testing isolation)
function getThemeColor() {
    return global.currentTheme === 'midnight-black' ? '#000000' : '#121212';
}

function isBright(color) {
    const match = color.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (!match) return false;
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
}

function isDark(color) {
    const match = color.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (!match) return false;
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
}

function smartBrighten(color) {
    const match = color.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (!match) return color;
    let r = parseInt(match[1]);
    let g = parseInt(match[2]);
    let b = parseInt(match[3]);

    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    if (s > 0 && l < 0.6) { l = 0.7; }

    let r1, g1, b1;
    if (s === 0) { r1 = g1 = b1 = l; }
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r1 = hue2rgb(p, q, h + 1 / 3);
        g1 = hue2rgb(p, q, h);
        b1 = hue2rgb(p, q, h - 1 / 3);
    }
    return `rgb(${Math.round(r1 * 255)}, ${Math.round(g1 * 255)}, ${Math.round(b1 * 255)})`;
}

// Updated Logic to Test: calculateChange and applyChange
function calculateChange(element) {
    if (!global.isEnabled) return null;
    if (element.dataset.smartDarkProcessed) return null;
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'LINK') return null;

    const computed = global.window.getComputedStyle(element);
    const bgColor = computed.backgroundColor;
    const color = computed.color;

    const updates = {};
    const datasetUpdates = {};

    const isTransparent = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';

    if (!isTransparent && isBright(bgColor)) {
        datasetUpdates.originalBg = element.style.backgroundColor;
        updates.backgroundColor = getThemeColor();
        datasetUpdates.smartDarkProcessed = 'true';
    } else if (!isTransparent && isDark(bgColor)) {
        datasetUpdates.smartDarkProcessed = 'true';
    }

    if (isDark(color)) {
        datasetUpdates.originalColor = element.style.color;
        const match = color.match(/rgba?\((\d+), (\d+), (\d+)/);
        let isNeutral = true;
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            if (Math.abs(r - g) > 10 || Math.abs(r - b) > 10 || Math.abs(g - b) > 10) {
                isNeutral = false;
            }
        }

        if (isNeutral) {
            updates.color = '#e0e0e0';
        } else {
            updates.color = smartBrighten(color);
        }
        datasetUpdates.smartDarkProcessed = 'true';
    }

    // Note: Image dimming via brightness filter was removed - causes blackout on dark images
    // The dimmer overlay provides uniform dimming across all content including images

    if (Object.keys(updates).length > 0 || Object.keys(datasetUpdates).length > 0) {
        return { element, updates, datasetUpdates };
    }
    return null;
}

function applyChange(change) {
    if (!change) return;
    const { element, updates, datasetUpdates } = change;
    for (const [key, value] of Object.entries(datasetUpdates)) {
        element.dataset[key] = value;
    }
    for (const [key, value] of Object.entries(updates)) {
        element.style[key] = value;
    }
}

// Wrapper to simulate old processElement for tests
function processElement(element) {
    const change = calculateChange(element);
    applyChange(change);
}

// Tests
console.log("Running Tests...");
let failed = false;

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        failed = true;
    } else {
        console.log(`PASS: ${message}`);
    }
}

// Test 1: Bright White Element -> Dark Gray
const el1 = new MockElement('DIV');
el1.computedStyle.backgroundColor = 'rgb(255, 255, 255)'; // Bright White
processElement(el1);
assert(el1.style.backgroundColor === '#121212', 'Bright element should become dark gray');
assert(el1.dataset.smartDarkProcessed === 'true', 'Element should be marked processed');

// Test 2: Dark Blue Element -> Should NOT Change
const el2 = new MockElement('DIV');
el2.computedStyle.backgroundColor = 'rgb(0, 0, 50)'; // Dark Blue
el2.style.backgroundColor = 'blue'; // Original style
processElement(el2);
assert(el2.style.backgroundColor === 'blue', 'Dark element background should not change');
assert(el2.dataset.smartDarkProcessed === 'true', 'Element should be marked processed');

// Test 3: Black Text -> White
const el3 = new MockElement('P');
el3.computedStyle.backgroundColor = 'rgba(0, 0, 0, 0)'; // Transparent
el3.computedStyle.color = 'rgb(0, 0, 0)'; // Black text
processElement(el3);
assert(el3.style.color === '#e0e0e0', 'Black text should become white');

// Test 4: Image should NOT be processed with filter anymore (dimming removed)
const el4 = new MockElement('IMG');
processElement(el4);
assert(el4.style.filter === undefined || el4.style.filter === '', 'Image should NOT have brightness filter applied');

// Test 5: Midnight Black Theme
global.currentTheme = 'midnight-black';
const el5 = new MockElement('DIV');
el5.computedStyle.backgroundColor = 'rgb(255, 255, 255)';
processElement(el5);
assert(el5.style.backgroundColor === '#000000', 'Bright element should become midnight black');

// Test 6: Dark Blue Link -> Brightened Blue
const el6 = new MockElement('A');
el6.computedStyle.backgroundColor = 'rgba(0,0,0,0)';
el6.computedStyle.color = 'rgb(0, 0, 150)'; // Standard-ish Link Blue
processElement(el6);
assert(el6.style.color !== '#e0e0e0', 'Colored link should NOT become white');
assert(el6.style.color !== 'rgb(0, 0, 150)', 'Colored link should change');
assert(el6.style.color.startsWith('rgb'), 'Colored link should be rgb');
console.log(`Original: rgb(0, 0, 150) -> New: ${el6.style.color}`);

// Test 7: Red Text -> Brightened Red
const el7 = new MockElement('SPAN');
el7.computedStyle.backgroundColor = 'rgba(0,0,0,0)';
el7.computedStyle.color = 'rgb(139, 0, 0)'; // Dark Red
processElement(el7);
assert(el7.style.color !== '#e0e0e0', 'Red text should NOT become white');
assert(el7.style.color !== 'rgb(139, 0, 0)', 'Red text should brighten');
console.log(`Original: rgb(139, 0, 0) -> New: ${el7.style.color}`);

if (failed) {
    console.error("Tests Failed");
    process.exit(1);
} else {
    console.log("All Tests Passed");
}
