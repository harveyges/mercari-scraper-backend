// /api/scrape.js

import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL; // Set this in Vercel!

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST for batch
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const urls = req.body?.urls;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_URL,
    });

    // SERIAL scraping to conserve tokens (all in one token/session)
    const results = [];
    for (let url of urls) {
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // Get structured product data (JSON-LD)
        const ldJson = await page.$$eval('script[type="application/ld+json"]', scripts => {
          const script = scripts.find(s => s.innerText.includes('"@type":"Product"'));
          return script ? script.innerText : '';
        });

        let product = {};
        if (ldJson) {
          try {
            product = JSON.parse(ldJson);
          } catch {}
        }

        // Title
        let title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');

        // Price
        let price = (product.offers && product.offers.price) ||
          await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');

        // First Image
        let firstImage = '';
        if (Array.isArray(product.image) && product.image[0]) {
          firstImage = product.image[0];
        }

        // Item Status
        let itemStatus = (product.offers && product.offers.availability) || '';
        itemStatus = itemStatus.includes('SoldOut') ? 'sold_out' : 'available';

        // Seller info (if available)
        let sellerName = product.seller && product.seller.name ? product.seller.name : null;
        let sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

        await page.close();

        results.push({
          url,
          title,
          price,
          firstImage,
          itemStatus,
          sellerName,
          sellerId,
          error: null,
        });

      } catch (itemError) {
        results.push({
          url,
          title: null,
          price: null,
          firstImage: null,
          itemStatus: null,
          sellerName: null,
          sellerId: null,
          error: itemError.message || 'Failed to fetch item',
        });
      }
    }

    await browser.close();

    return res.status(200).json({ results });

  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
