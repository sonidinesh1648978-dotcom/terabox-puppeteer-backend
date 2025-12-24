import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 10000;

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
      executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
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

    let finalDownloadUrl = null;

    // 🔥 INTERCEPT RESPONSES
    page.on("response", async response => {
      try {
        const url = response.url();

        // Terabox API that returns download link
        if (
          url.includes("/share/list") ||
          url.includes("dlink") ||
          url.includes("download")
        ) {
          const text = await response.text();

          // Match real data.terabox.app link
          const match = text.match(
            /https:\/\/data\.terabox\.app\/file\/[^"&]+/
          );

          if (match) {
            finalDownloadUrl = match[0];
          }
        }
      } catch (_) {}
    });

    await page.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 0
    });

    // wait for API responses
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (!finalDownloadUrl) {
      throw new Error(
        "Terabox API response intercepted, but download URL not found"
      );
    }

    res.json({
      success: true,
      download: finalDownloadUrl
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
