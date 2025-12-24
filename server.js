import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Terabox Puppeteer Backend is running ✅");
});

app.get("/fetch", async (req, res) => {
  const shareUrl = req.query.url;

  if (!shareUrl || !shareUrl.includes("terabox")) {
    return res.json({ error: "Invalid Terabox URL" });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.goto(shareUrl, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // IMPORTANT: allow Terabox JS to fully run
    await page.waitForTimeout(8000);

    // Extract direct download link from page context
    const result = await page.evaluate(() => {
      const links = [...document.querySelectorAll("a")]
        .map(a => a.href)
        .filter(h => h && h.includes("download"));

      return links.length ? links[0] : null;
    });

    if (!result) {
      throw new Error("Download link not found (Terabox JS blocked)");
    }

    res.json({
      success: true,
      download: result
    });

  } catch (err) {
    res.json({
      error: "Failed to generate download link",
      details: err.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
