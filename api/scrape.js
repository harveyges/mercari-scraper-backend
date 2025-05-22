import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let url = '';
  if (req.method === 'GET') {
    url = req.query.url;
  } else if (req.method === 'POST') {
    url = req.body?.url;
  }

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

    const ldJson = await page.$$eval('script[type="application/ld+json"]', scripts => {
      const script = scripts.find(s => s.innerText.includes('"@type":"Product"'));
      return script ? script.innerText : '';
    });

    let product = {};
    if (ldJson) {
      try { product = JSON.parse(ldJson); } catch {}
    }

    let title = product.name || await page.$eval('h1', el => el.textContent.trim()).catch(() => '');
    let price = (product.offers && product.offers.price) || await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => '');
    let firstImage = Array.isArray(product.image) && product.image[0] ? product.image[0] : '';
    let itemStatus = (product.offers && product.offers.availability) || '';
    itemStatus = itemStatus.includes('SoldOut') ? 'sold_out' : 'available';
    let sellerName = product.seller && product.seller.name ? product.seller.name : null;
    let sellerId = product.seller && product.seller['@id'] ? product.seller['@id'] : null;

    await browser.close();

    return res.status(200).json({
      title,
      price,
      firstImage,
      itemStatus,
      sellerName,
      sellerId,
    });

  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
