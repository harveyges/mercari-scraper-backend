import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_URL,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // TITLE
    const itemTitle = await page.$eval('h1', el => el.textContent.trim());

    // PRICE
    const price = await page.$eval('meta[name="product:price:amount"]', el => el.content);

    // FIRST IMAGE
    const firstImage = await page.$eval('meta[property="og:image"]', el => el.content);

    // ITEM DESCRIPTION (from JSON-LD script)
    const jsonLd = await page.$$eval('script[type="application/ld+json"]', els => {
      for (const el of els) {
        try {
          const data = JSON.parse(el.textContent);
          if (data['@type'] === 'Product') return data;
        } catch (e) {}
      }
      return null;
    });

    const description = jsonLd?.description || null;

    // SELLER INFO (from JSON-LD, fallback to null)
    // (Mercari often doesn't expose full seller info in HTML—will show sellerID if found)
    let sellerName = null;
    let sellerId = null;
    if (jsonLd && jsonLd.offers && jsonLd.offers.seller) {
      sellerName = jsonLd.offers.seller.name || null;
      sellerId = jsonLd.offers.seller['@id'] || null;
    }

    // ITEM STATUS (available or sold out)
    let itemStatus = 'unknown';
    if (jsonLd && jsonLd.offers && jsonLd.offers.availability) {
      if (jsonLd.offers.availability.includes('SoldOut')) {
        itemStatus = 'sold_out';
      } else if (jsonLd.offers.availability.includes('InStock')) {
        itemStatus = 'available';
      }
    }

    await browser.close();

    return res.status(200).json({
      title: itemTitle,
      price,
      firstImage,
      description,
      sellerName,
      sellerId,
      itemStatus,
    });

  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).json({ error: err.message });
  }
}
