import express from "express";
import puppeteer from "puppeteer-core";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 10000;

const CHROME = "/usr/bin/chromium";
const COOKIES_FILE = "cookies.json";

function fixURL(url) {
  if (!url) return null;
  return url
    .trim()
    .replace("teraboxurl.com", "1024terabox.com")
    .replace("www.", "")
    .replace(/https?:\/\/https?:\/\//gi, "https://");
}

app.get("/api", async (req, res) => {
  let share = fixURL(req.query.url);
  if (!share) return res.json({ error: "❌ Provide ?url=" });
  console.log("➡️ Opening:", share);

  if (!fs.existsSync(COOKIES_FILE)) {
    return res.json({
      error: "❌ No cookies.json found",
      fix: "Login locally first and upload cookies.json"
    });
  }

  const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );

  let fileURL = null;
  page.on("request", req2 => {
    const u = req2.url();
    if (u.includes("data.terabox.app") && u.includes("file")) {
      fileURL = u;
      console.log("🎯 Captured:", u);
    }
  });

  try {
    await page.goto(share, { waitUntil: "domcontentloaded", timeout: 25000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(4000);

    // try to unlock
    const unlockSelectors = [
      "text='Save to'",
      "text='Download'",
      ".vjs-big-play-button",
      "video"
    ];
    for (let s of unlockSelectors) {
      try { await page.click(s); } catch {}
    }

    await page.waitForTimeout(6000);

    if (fileURL) {
      await browser.close();
      return res.json({ status: "🟢 Success", download: fileURL });
    }

    await browser.close();
    return res.json({
      error: "🔒 Hidden behind login or save requirement",
      fix: "Open link manually once & click 'Save to TeraBox'"
    });

  } catch (err) {
    await browser.close();
    return res.json({ error: "❌ Failed", message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
