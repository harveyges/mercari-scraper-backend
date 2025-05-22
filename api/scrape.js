// /api/scrape.js

import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL; // Set this in Vercel Environment Variables

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;
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

    // --- 1. Get product data from <script type="application/ld+json">
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

    // --- 2. Title
    let title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');

    // --- 3. Price
    let price = (product.offers && product.offers.price) ||
                await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');

    // --- 4. First Image (robust logic)
    let firstImage = '';
    if (Array.isArray(product.image) && product.image[0]) {
      firstImage = product.image[0];
    } else {
      // Fallback: grab first Mercari product image
      firstImage = await page
        .$eval('img[alt][src^="https://static.mercdn.net/item/detail/orig/photos/"]', el => el.src)
        .catch(() => '');
    }

    // --- 5. Description
    let description = product.description || '';

    // --- 6. Item Status
    let itemStatus = (product.offers && product.offers.availability) || '';
    itemStatus = itemStatus.includes('SoldOut') ? 'sold_out' : 'available';

    // --- 7. Seller Info (Mercari may hide this)
    let sellerName = product.seller && product.seller.name ? product.seller.name : null;
    let sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

    await browser.close();

    // --- 8. Respond with result
    return res.status(200).json({
      title,
      price,
      firstImage,
      description,
      itemStatus,
      sellerName,
      sellerId,
    });

  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
