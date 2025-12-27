import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
const COOKIE_FILE = "./cookies.json";
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

// Normalize user input
function normalize(input) {
  if (!input) return null;
  input = input.trim();

  input = input
    .replace(/https?:\/\/https?:\/\//gi, "https://")
    .replace(/1024https?:\/\//gi, "https://")
    .replace(/teraboxurl\.com/gi, "1024terabox.com")
    .replace(/terabox\.com/gi, "1024terabox.com");

  // Remove second domain if duplicated
  input = input.replace(/https:\/\/1024terabox\.com\/https:\/\/1024terabox\.com/gi, "https://1024terabox.com");

  return input;
}

// Convert share link → DM redirect link
function convertToDM(url) {
  const surl = url.split("/s/")[1]?.split("?")[0];
  return `https://dm.1024tera.com/sharing/link?surl=${surl}&clearCache=1`;
}

// Launch Stealth Chromium
async function launch() {
  return puppeteer.launch({
    headless: "new",
    executablePath: CHROME,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1200,800"
    ]
  });
}

// API: Extract Link
app.get("/api", async (req, res) => {
  const shared = normalize(req.query.url);
  if (!shared) return res.json({ error: "Provide ?url=" });

  const dm = convertToDM(shared);
  console.log("➡ Visiting:", dm);

  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage();

    // Load cookies if exist
    if (fs.existsSync(COOKIE_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE));
      await page.setCookie(...cookies);
      console.log("🍪 Cookies loaded");
    }

    await page.setExtraHTTPHeaders({
      "Referer": "https://1024terabox.com/",
      "Accept-Language": "en-US,en;q=0.9"
    });

    await page.goto(dm, {
      waitUntil: "networkidle2",
      timeout: 25000
    });

    // Extract direct link
    const direct = await page.evaluate(() => {
      const btn = document.querySelector("a[href*='data.terabox']");
      return btn ? btn.href : null;
    });

    if (!direct) throw new Error("No direct link found — login/cookies required.");

    return res.json({
      status: "success",
      original: shared,
      final: direct
    });

  } catch (e) {
    return res.json({ error: "Failed", message: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`🚀 Running on ${PORT}`));
