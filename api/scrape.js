// /api/scrape.js

import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body || {};
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No urls provided' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_URL });

    const results = [];

    // Scrape one by one for reliability (can make concurrent if desired)
    for (const url of urls) {
      let result = { url };
      let page;

      try {
        page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });

        // 1. Try to get JSON-LD Product data
        const ldJson = await page.$$eval('script[type="application/ld+json"]', scripts => {
          const script = scripts.find(s => s.innerText.includes('"@type":"Product"'));
          return script ? script.innerText : '';
        });

        let product = {};
        if (ldJson) {
          try { product = JSON.parse(ldJson); } catch {}
        }

        // 2. Title
        let title = product.name || '';
        if (!title) {
          try {
            title = await page.$eval('h1', el => el.textContent.trim());
          } catch {
            title = '';
          }
        }

        // 3. Price
        let price = (product.offers && product.offers.price) || '';
        if (!price) {
          try {
            price = await page.$eval('meta[name="product:price:amount"]', el => el.content);
          } catch {
            price = '';
          }
        }

        // 4. First image
        let firstImage = '';
        if (Array.isArray(product.image) && product.image.length > 0) {
          firstImage = product.image[0];
        }

        // 5. Item status
        let itemStatus = (product.offers && product.offers.availability) || '';
        itemStatus = itemStatus.includes('SoldOut') ? 'sold_out' : 'available';

        // 6. Seller info (may be missing)
        let sellerName = product.seller && product.seller.name ? product.seller.name : null;
        let sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

        // Assign to result
        result.title = title;
        result.price = price;
        result.firstImage = firstImage;
        result.itemStatus = itemStatus;
        result.sellerName = sellerName;
        result.sellerId = sellerId;
        result.error = null;

      } catch (err) {
        result.title = '';
        result.price = '';
        result.firstImage = '';
        result.itemStatus = '';
        result.sellerName = null;
        result.sellerId = null;
        result.error = err.message || 'Unknown error';
      } finally {
        if (page) await page.close();
      }

      results.push(result);
    }

    await browser.close();

    return res.status(200).json({ results });
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
