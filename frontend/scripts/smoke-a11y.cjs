const puppeteer = require('puppeteer-core');
const fs = require('fs');

// Lightweight smoke + accessibility + console checker using axe-core
// Pages to check (relative to baseUrl)
const pages = ['/', '/customers', '/invoices', '/reports'];
const baseUrl = process.env.BASE_URL || 'http://localhost:3003';

async function run() {
  // try common installed browser locations (Chrome / Edge)
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  let executablePath = possiblePaths.find(p => fs.existsSync(p));
  const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (executablePath) launchOpts.executablePath = executablePath;
  else console.warn('No system browser found in common paths; puppeteer-core requires a browser.');

  const browser = await puppeteer.launch(launchOpts);
  const results = [];

  for (const path of pages) {
    const page = await browser.newPage();
    const pageUrl = new URL(path, baseUrl).toString();
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      // inject axe
      const axeScript = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
      await page.evaluate(axeScript);
      const a11y = await page.evaluate(async () => {
        return await axe.run();
      });

      results.push({ url: pageUrl, consoleErrors, a11y });
    } catch (err) {
      results.push({ url: pageUrl, consoleErrors, error: String(err) });
    }
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
