// ===================== IMPORTS =====================
import express from "express";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ===================== CONFIG =====================
const app = express();
const PORT = process.env.PORT || 10000;

const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_FILE = "cookies.json";

// ===================== URL NORMALIZER =====================
function normalizeURL(url) {
  if (!url) return null;
  url = url.trim();

  // Remove duplicate http(s)
  url = url.replace(/https?:\/\/https?:\/\//gi, "https://");

  // Remove 1024https or double 1024 prefixes
  url = url.replace(/1024https?:\/\//gi, "https://");

  // Fix double domain issues
  url = url.replace(/https:\/\/1024terabox\.com\/1024terabox\.com/gi, "https://1024terabox.com");

  // Convert terabox mirrors to 1024 domain
  url = url.replace(/https?:\/\/(www\.)?(terabox|teraboxurl|teraboxapp)\.com/gi, "https://1024terabox.com");

  // Always ensure correct prefix
  if (!url.startsWith("https://1024terabox.com")) {
    url = "https://1024terabox.com" + url.replace(/.*1024terabox\.com/, "");
  }

  return url;
}

// ===================== LAUNCH CHROMIUM =====================
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--single-process",
      "--ignore-certificate-errors",
      "--window-size=1366,768",
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
    ],
  });
}

// ===================== SAFE NAVIGATION =====================
async function safeGoto(page, url) {
  const strategies = ["domcontentloaded", "networkidle0", "load"];
  for (const mode of strategies) {
    try {
      await page.goto(url, { waitUntil: mode, timeout: 20000 });
      return true;
    } catch {
      console.log(`⚠️ Retry: ${mode}`);
    }
  }
  return false;
}

// ===================== MAIN API ROUTE =====================
app.get("/api", async (req, res) => {
  let url = normalizeURL(req.query.url);
  if (!url) return res.json({ error: "❌ No link provided, use: ?url=" });

  console.log("🌍 Final URL:", url);

  // Load Cookies
  let cookies = [];
  if (fs.existsSync(COOKIES_FILE)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
    console.log("🍪 Cookies Loaded");
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Apply cookies if exist
    if (cookies.length) await page.setCookie(...cookies);

    // Headers to reduce blocking
    await page.setExtraHTTPHeaders({
      "Referer": "https://1024terabox.com/",
      "Accept-Language": "en-US,en;q=0.9",
      "DNT": "1"
    });

    // Try loading
    const ok = await safeGoto(page, url);
    if (!ok) throw new Error("Page blocked or failed to load");

    // Remove login popups / overlays
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => {
      [
        "div.login-dialog",
        "iframe[src*='google']",
        ".modal-dialog",
        "#ncPopups",
      ].forEach(sel => document.querySelector(sel)?.remove());
    });

    // Extract download link
    const link = await page.evaluate(() => {
      const selectors = [
        "a[href*='download']",
        "a[href*='.mp4']",
        "video source[src]",
        "a[class*='dl']",
      ];
      for (let s of selectors) {
        const el = document.querySelector(s);
        if (el) return el.href || el.src;
      }
      return null;
    });

    if (!link) return res.json({ error: "❌ Download link hidden / login needed" });

    return res.json({
      status: "🟢 OK",
      original: url,
      directLink: link
    });

  } catch (e) {
    console.log("❌ ERROR:", e.message);
    return res.json({ error: "❌ Failed", details: e.message });

  } finally {
    if (browser) await browser.close();
  }
});

// ===================== START SERVER =====================
app.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
