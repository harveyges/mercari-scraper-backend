// scrape.js
import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL; // Set this in Vercel environment vars!

export default async function handler(req, res) {
  // Example usage: GET /api/scrape?url=https://jp.mercari.com/item/m99511546897
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  // Connect to browserless.io endpoint
  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSERLESS_URL,
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Example: Get item title
  const itemTitle = await page.$eval('h1', el => el.textContent.trim());

  // Add more scraping logic here...

  await browser.close();

  return res.status(200).json({ title: itemTitle });
}
