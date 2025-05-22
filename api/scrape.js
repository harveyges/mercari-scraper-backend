import puppeteer from 'puppeteer';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL;

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_URL });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 1. Scrape the title
    await page.waitForSelector('h1', { timeout: 10000 });
    const itemTitle = await page.$eval('h1', el => el.textContent.trim());

    // 2. Scrape price from meta tag
    let itemPrice = await page.$eval('meta[name="product:price:amount"]', el => el.content).catch(() => null);

    // 3. If not found, try to get price from JSON-LD script
    if (!itemPrice) {
      itemPrice = await page.$$eval('script[type="application/ld+json"]', scripts => {
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent);
            if (data && data.offers && data.offers.price) {
              return data.offers.price;
            }
          } catch (e) {}
        }
        return null;
      });
    }

    await browser.close();
    return res.status(200).json({ title: itemTitle, price: itemPrice });
  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: error.message });
  }
}
