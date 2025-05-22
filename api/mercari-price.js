import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: "No URL provided" });
    return;
  }

  try {
    const response = await axios.get(
      `http://api.scraperapi.com?api_key=082f5b7af0eed4ff9c3b756a8b81af44&url=${encodeURIComponent(url)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      }
    );
    const html = response.data;
    console.log(html); // DEBUG: print fetched HTML to Vercel function logs
    const $ = cheerio.load(html);

    // Try meta first, fallback to price div
    const price =
      $("meta[property='product:price:amount']").attr("content") ||
      $("div[data-testid='price']").text().replace(/[^\d]/g, "");

    if (price) {
      res.status(200).json({ price });
    } else {
      res.status(200).json({ price: "Not Found" });
    }
  } catch (err) {
    res.status(500).json({ price: "Error", error: err.message });
  }
}
