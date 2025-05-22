import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body || {};
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  let browser;
  let results = [];
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_URL });

    for (const url of urls) {
      let result = { url, title: '', price: '', firstImage: '', itemStatus: '', error: null };

      try {
        const page = await browser.newPage();

        // Block unnecessary resources (images, ads, etc.)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const type = req.resourceType();
          if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type) ||
              req.url().includes('googleads') || req.url().includes('analytics')) {
            req.abort();
          } else {
            req.continue();
          }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // Extract <script type="application/ld+json"> with @type:Product
        const ldJson = await page.$$eval('script[type="application/ld+json"]', scripts => {
          const s = scripts.find(s => s.innerText.includes('"@type":"Product"'));
          return s ? s.innerText : '';
        });

        let product = {};
        if (ldJson) {
          try { product = JSON.parse(ldJson); } catch {}
        }

        // 1. Title
        result.title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');

        // 2. Price
        result.price = (product.offers && product.offers.price) ||
          await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');

        // 3. First Image
        result.firstImage = Array.isArray(product.image) ? product.image[0] : '';

        // 4. Status (Available/Sold Out)
        let status = (product.offers && product.offers.availability) || '';
        result.itemStatus = status.includes('SoldOut') ? 'sold_out' : 'available';

        // (Optional) 5. Seller Info (Mercari rarely exposes this)
        result.sellerName = product.seller && product.seller.name ? product.seller.name : null;
        result.sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

        await page.close();
      } catch (err) {
        result.error = err.message;
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
