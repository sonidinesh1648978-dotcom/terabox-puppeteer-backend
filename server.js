import express from "express";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Terabox Puppeteer Backend is running ✅");
});

app.get("/fetch", async (req, res) => {
  const shareUrl = req.query.url;

  if (!shareUrl || !shareUrl.includes("terabox")) {
    return res.status(400).json({ error: "Invalid Terabox link" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled"
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

    await page.waitForTimeout(6000);

    const downloadUrl = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const match = html.match(/https:\/\/data\.terabox\.app\/file\/[^"&]+/);
      return match ? match[0] : null;
    });

    if (!downloadUrl) {
      throw new Error("Download link not found");
    }

    res.json({
      success: true,
      download: downloadUrl
    });

  } catch (err) {
    res.status(500).json({
      error: "Failed to generate download link",
      details: err.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
