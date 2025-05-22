// api/scrape.js
import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL; // Set in Vercel env vars

export default async function handler(req, res) {
  // Accept url via query: /api/scrape?url=...
  const url = req.query?.url;

  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_URL,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Example: Scrape title, price, and images from Mercari
    const itemTitle = await page.$eval('h1', el => el.textContent.trim());

    // Mercari price is in <div> with data-testid="price" (as of 2024)
    const itemPrice = await page.$eval('[data-testid="price"]', el =>
      el.textContent.replace(/[^\d]/g, '')
    );

    // Get main image URL (first <img> inside main photo area)
    const itemImage = await page.$eval('img[alt][src]', el => el.src);

    await browser.close();

    return res.status(200).json({
      title: itemTitle,
      price: itemPrice,
      image: itemImage,
      url,
    });
  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).json({ error: err.message });
  }
}
