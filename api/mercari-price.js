// pages/api/mercari-price.js
import axios from 'axios';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing URL' });
  }

  const SCRAPERAPI_KEY = '082f5b7af0eed4ff9c3b756a8b81af44'; // <-- insert your key here
  const scraperApiUrl = `http://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(url)}&render=true`;

  try {
    // 1. Get HTML using ScraperAPI with render=true
    const { data: html } = await axios.get(scraperApiUrl);

    // 2. Load into Cheerio
    const $ = cheerio.load(html);

    // 3. Try to extract price (adjust selector as needed)
    // Mercari price is usually in a span with data-testid="price"
    let price = $('[data-testid="price"]').first().text().trim();

    // Fallback selector: try common class names if above fails
    if (!price) {
      price = $('span[class*=price], div[class*=price]').first().text().trim();
    }

    // 4. Return result
    res.status(200).json({ price: price || 'Not Found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
