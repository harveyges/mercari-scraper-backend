import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_URL });
    const page = await browser.newPage();

    // Set user agent to appear as a real browser
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36');

    // Go to page and wait for network to be idle (all JS done)
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for h1 (item title) to appear
    await page.waitForSelector('h1', { timeout: 10000 });

    // Get the item title
    const itemTitle = await page.$eval('h1', el => el.textContent.trim());

    await browser.close();
    return res.status(200).json({ title: itemTitle });
  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: error.message });
  }
}
