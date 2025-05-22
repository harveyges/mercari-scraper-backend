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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { urls } = req.body;
  if (!urls || !Array.isArray(urls) || !urls.length) {
    return res.status(400).json({ error: 'No urls provided' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_URL,
    });

    // Concurrency control
    const concurrency = 2;
    const results = [];
    let idx = 0;

    async function scrapeMercari(url) {
      const result = { url, title: '', price: '', firstImage: '', itemStatus: '', sellerName: null, sellerId: null };
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // 1. Get the <script type="application/ld+json">
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

        // 2. Title
        result.title = product.name || (await page.$eval('h1', el => el.textContent.trim()).catch(() => ''));

        // 3. Price
        result.price =
          (product.offers && product.offers.price) ||
          (await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => ''));

        // 4. First Image
        if (product.image) {
          if (Array.isArray(product.image) && product.image[0]) {
            result.firstImage = product.image[0];
          } else if (typeof product.image === 'string') {
            result.firstImage = product.image;
          } else {
            result.firstImage = '';
          }
        } else {
          // Fallback: find first product image from known img selectors
          result.firstImage = await page.$eval('img[src*="static.mercdn.net/item/detail"]', img => img.src).catch(() => '');
        }

        // 5. Status
        let itemStatus = (product.offers && product.offers.availability) || '';
        result.itemStatus = itemStatus.includes('SoldOut') ? 'sold_out' : 'available';

        // 6. Seller info
        result.sellerName = product.seller && product.seller.name ? product.seller.name : null;
        result.sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

        await page.close();
      } catch (err) {
        result.error = err.message;
      }
      return result;
    }

    // Batch with concurrency
    async function batchScrape(urls, concurrency) {
      const results = [];
      let i = 0;
      async function next() {
        if (i >= urls.length) return;
        const currentIdx = i++;
        results[currentIdx] = await scrapeMercari(urls[currentIdx]);
        await next();
      }
      // Launch concurrent runners
      const runners = [];
      for (let k = 0; k < concurrency && k < urls.length; k++) {
        runners.push(next());
      }
      await Promise.all(runners);
      return results;
    }

    const scrapeResults = await batchScrape(urls, concurrency);

    await browser.close();

    return res.status(200).json({ results: scrapeResults });

  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
