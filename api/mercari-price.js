import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const { data: html } = await axios.get(url, {
      headers: {
        // Sometimes Mercari blocks bots—simulate a real browser:
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
      },
    });
    const $ = cheerio.load(html);

    // Find the price (Mercari's HTML may change, so selector might need tweaking!)
    const priceText =
      $('div[class*="item-price"]').text() || $('span[itemprop="price"]').text();

    if (priceText) {
      return res.status(200).json({ price: priceText });
    } else {
      return res.status(404).json({ price: "Not Found" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
