// /api/scrape.js

import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL; // Set in Vercel env vars

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Accept only POST for multiple URLs
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  let browser;
  const results = [];
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_URL,
    });

    for (const url of urls) {
      let item = { url };

      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Get ld+json data
        const ldJson = await page.$$eval('script[type="application/ld+json"]', scripts => {
          const script = scripts.find(s => s.innerText.includes('"@type":"Product"'));
          return script ? script.innerText : '';
        });

        let product = {};
        if (ldJson) {
          try { product = JSON.parse(ldJson); } catch {}
        }

        // Scrape data
        item.title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');
        item.price = (product.offers && product.offers.price) || await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');
        item.firstImage = Array.isArray(product.image) ? product.image[0] : '';
        item.description = product.description || '';
        let status = (product.offers && product.offers.availability) || '';
        item.itemStatus = status.includes('SoldOut') ? 'sold_out' : 'available';
        item.sellerName = product.seller && product.seller.name ? product.seller.name : null;
        item.sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

        await page.close();

      } catch (err) {
        item.error = err.message;
      }

      results.push(item);
    }

    await browser.close();
    return res.status(200).json({ items: results });

  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
