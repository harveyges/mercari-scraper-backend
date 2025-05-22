import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Missing url' });
      return;
    }

    // Fetch the HTML of the page (pretend to be a browser)
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });

    // Load HTML with cheerio
    const $ = cheerio.load(html);

    // Try to find the price (Mercari uses <span> with data-testid or price class)
    // You might need to inspect the Mercari page source, but this often works:
    let price = $('[data-testid="item-price"]').text().trim();
    if (!price) {
      price = $('span[class*=price], div[class*=price]').first().text().trim();
    }
    // Remove yen and commas
    price = price.replace(/[^\d]/g, '');

    if (!price) {
      res.status(404).json({ price: 'Not Found' });
      return;
    }

    res.status(200).json({ price });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
