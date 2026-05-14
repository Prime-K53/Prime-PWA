const puppeteer = require('puppeteer');
const fs = require('fs');

async function testLaunch() {
    console.log('Attempting to launch Puppeteer with manual path...');
    
    const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    let executablePath = null;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            executablePath = p;
            console.log('Found browser at:', p);
            break;
        }
    }

    if (!executablePath) {
        console.error('No browser found in common paths!');
        process.exit(1);
    }

    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: executablePath,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox'
            ]
        });
        console.log('Puppeteer launched successfully!');
        const version = await browser.version();
        console.log('Browser version:', version);
        await browser.close();
        console.log('Browser closed successfully.');
    } catch (error) {
        console.error('Puppeteer launch FAILED:');
        console.error(error);
    }
}

testLaunch();
