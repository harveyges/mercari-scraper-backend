import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

// Utility: Batch array into chunks of size n
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { urls } = req.body || {};
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  const CONCURRENCY = 2; // <-- How many at a time (2–3 is safest for Mercari)
  let browser;
  let results = [];

  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_URL });

    // Split into batches
    const urlChunks = chunkArray(urls, CONCURRENCY);

    for (let chunk of urlChunks) {
      // For each batch, process concurrently
      const batchResults = await Promise.all(
        chunk.map(async url => {
          let result = { url, title: '', price: '', firstImage: '', itemStatus: '', error: null };
          let page;
          try {
            page = await browser.newPage();

            // Block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', req => {
              const type = req.resourceType();
              if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) req.abort();
              else req.continue();
            });

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

            const ldJson = await page.$$eval('script[type="application/ld+json"]', scripts => {
              const s = scripts.find(s => s.innerText.includes('"@type":"Product"'));
              return s ? s.innerText : '';
            });

            let product = {};
            if (ldJson) { try { product = JSON.parse(ldJson); } catch {} }
            result.title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');
            result.price = (product.offers && product.offers.price) ||
              await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');
            result.firstImage = Array.isArray(product.image) ? product.image[0] : '';
            let status = (product.offers && product.offers.availability) || '';
            result.itemStatus = status.includes('SoldOut') ? 'sold_out' : 'available';
          } catch (err) {
            result.error = err.message;
          }
          if (page) await page.close();
          return result;
        })
      );
      results = results.concat(batchResults);
      // Wait a tiny bit between batches to avoid burst detection (optional, e.g., 500ms)
      await new Promise(r => setTimeout(r, 500));
    }

    await browser.close();
    return res.status(200).json({ results });
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
