import express from "express";
import fs from "fs";
import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const COOKIES_FILE = path.join(__dirname, "cookies.json");
const CHROME_PATH = "/usr/bin/chromium";

// ---------------- URL FIX ----------------
function convertToDM(url) {
  if (!url || !url.includes("/s/")) return null;
  let token = url.split("/s/")[1].split("?")[0];

  // Fix "1b_..." pattern
  if (token.startsWith("1b_")) token = token.substring(1);

  return `https://dm.1024tera.com/sharing/link?surl=${token}&clearCache=1`;
}

// ---------------- PUPPETEER LAUNCH ----------------
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,720"
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });
}

// ---------------- CLOUD FLARE FRIENDLY LOAD ----------------
async function loadSafe(page, url) {
  const events = ["networkidle2", "domcontentloaded", "load"];
  for (const evt of events) {
    try {
      console.log(`⏳ Loading (${evt})...`);
      await page.goto(url, { waitUntil: evt, timeout: 60000 });
      return true;
    } catch {
      console.log(`⚠️ Retry: ${evt}`);
    }
  }
  return false;
}

// ---------------- API ROUTE ----------------
app.get("/api", async (req, res) => {
  const original = req.query.url;
  const dmURL = convertToDM(original);

  if (!dmURL) return res.json({ error: "❌ Invalid Terabox link" });

  console.log("➡ Visiting:", dmURL);

  // Load cookies
  let cookies = [];
  if (fs.existsSync(COOKIES_FILE)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
    console.log("🍪 Cookies loaded");
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Apply cookies if exist
    if (cookies.length) await page.setCookie(...cookies);

    // Anti-bot headers (IMPORTANT)
    await page.setExtraHTTPHeaders({
      "Upgrade-Insecure-Requests": "1",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://1024terabox.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });

    // Navigate with retries
    const ok = await loadSafe(page, dmURL);
    if (!ok) throw new Error("Page blocked or failed (Cloudflare/timeout)");

    // Wait for challenge
    await page.waitForSelector("body", { timeout: 20000 }).catch(() => {});

    // Extract a valid link
    const link = await page.evaluate(() => {
      let selectors = [
        "a[href*='data.terabox']",
        "a[href*='file']",
        "a[href*='download']",
        "a[href*='usercontent']"
      ];
      for (let sel of selectors) {
        let a = document.querySelector(sel);
        if (a) return a.href;
      }
      return null;
    });

    if (!link) return res.json({ error: "❌ File found but download link hidden" });

    return res.json({ status: "🟢 Success", link });

  } catch (e) {
    return res.json({ error: "❌ Failed", message: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
