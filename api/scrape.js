import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL; // Set this in Vercel!

// Helper: limit concurrency
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let urls;
  try {
    urls = req.body.urls || [];
    if (!Array.isArray(urls) || urls.length === 0) throw new Error('No URLs provided');
  } catch {
    return res.status(400).json({ error: 'Invalid body or missing urls' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_URL });

    const scrape = async (url) => {
      let result = { url };
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // 1. Get the full <script type="application/ld+json">
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
        result.title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');

        // Price
        result.price = (product.offers && product.offers.price) || 
            await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');

        // First Image
        result.firstImage = (Array.isArray(product.image) && product.image[0]) ? product.image[0] : '';

        // Status
        let itemStatus = (product.offers && product.offers.availability) || '';
        result.itemStatus = itemStatus.includes('SoldOut') ? 'sold_out' : 'available';

        // Seller Info (Mercari rarely provides this)
        result.sellerName = product.seller && product.seller.name ? product.seller.name : null;
        result.sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

        await page.close();
      } catch (err) {
        result.error = err.message;
      }
      return result;
    };

    // Run in batch with concurrency = 2
    const results = await asyncPool(2, urls, scrape);

    await browser.close();
    return res.status(200).json({ results });

  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
