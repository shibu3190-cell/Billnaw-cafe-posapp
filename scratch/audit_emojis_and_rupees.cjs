const fs = require('fs');
const path = require('path');

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
const EMOJI_GLOBAL = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu;

const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');

console.log("=== CHECKING ALL HTML LINES FOR EMOJIS IN INTERACTIVE / TAB / PILL / BTN / NAV ===");
lines.forEach((line, idx) => {
    if (EMOJI_REGEX.test(line)) {
        // check if this line is part of a button, tab, pill, or nav
        const hasInteractiveClass = /class=["'][^"']*(?:tab|pill|btn|badge|nav|action|filter|chip|header|link)[^"']*["']/i.test(line);
        const isTag = /<(?:button|a|span|div|li)\b/i.test(line);
        if (hasInteractiveClass || isTag) {
            console.log(`Line ${idx + 1}: ${line.trim()}`);
        }
    }
});

console.log("\n=== CHECKING ALL JS FILES FOR RAW EMOJIS IN BUTTONS, TABS, PILLS ===");
const jsDir = 'js';
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
files.forEach(f => {
    const fLines = fs.readFileSync(path.join(jsDir, f), 'utf8').split('\n');
    fLines.forEach((line, idx) => {
        if (EMOJI_REGEX.test(line)) {
            if (line.includes('<button') || line.includes('class=') || line.includes('btn') || line.includes('pill') || line.includes('tab')) {
                console.log(`${f}:${idx + 1}: ${line.trim()}`);
            }
        }
    });
});
