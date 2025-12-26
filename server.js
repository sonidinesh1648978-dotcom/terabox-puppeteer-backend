import express from "express";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();
const COOKIES_PATH = path.join(__dirname, "cookies.json");

// Detect Chromium Path for Render
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

// -------- DOMAIN NORMALIZER --------
function normalizeTerabox(url) {
  if (!url) return null;
  return url
    .replace(/https?:\/\/(www\.)?teraboxurl\.com/i, "https://1024terabox.com")
    .replace(/https?:\/\/(www\.)?terabox\.com/i, "https://1024terabox.com");
}

// -------- DIAGNOSTICS --------
app.get("/diagnose", async (req, res) => {
  try {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        executablePath: CHROME_PATH,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      await browser.close();
      res.json({
        chromiumPath: CHROME_PATH,
        cookies: fs.existsSync(COOKIES_PATH) ? "🟢 Found" : "❌ Missing",
        launch: "🟢 Chromium launched successfully!"
      });
    } catch (e) {
      res.json({
        chromiumPath: CHROME_PATH,
        cookies: fs.existsSync(COOKIES_PATH) ? "🟢 Found" : "❌ Missing",
        launch: "🔴 Launch failed",
        error: e.message
      });
    }
  } catch (err) {
    res.json({ error: "Unexpected error", details: err.toString() });
  }
});

// -------- MAIN API /fetch --------
app.get("/fetch", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: "❌ Provide ?url=",
      example: "/fetch?url=https://teraboxurl.com/s/xxxxxxx"
    });
  }

  // Normalize domain
  url = normalizeTerabox(url);
  console.log("🌐 Normalized:", url);

  let browser, page;
  try {
    // ---- LAUNCH BROWSER SAFE CONFIG ----
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      ignoreHTTPSErrors: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--single-process",
        "--no-zygote",
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list",
        "--window-size=1280,720",
        "--start-maximized",
        `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`
      ]
    });

    page = await browser.newPage();

    // ---- SAFETY: prevent auto-close crashes ----
    page.on("error", () => {});
    page.on("pageerror", () => {});
    page.on("close", () => console.log("⚠️ Page was closed, recovering..."));

    // ---- ANTI-BOT SHIELD ----
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://1024terabox.com/",
      "Cache-Control": "no-cache"
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    });

    // ---- LOAD LOGIN COOKIES ----
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
      await page.setCookie(...cookies);
      console.log("🍪 Cookies Loaded");
    } else {
      console.log("⚠️ No cookies found! Some links may fail.");
    }

    // ---- NAVIGATION + FALLBACK ----
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    }

    // Empty response fix
    if ((await page.content()).length < 3000) {
      await page.reload({ waitUntil: "networkidle2" });
    }

    // Page may close → reopen new tab
    if (page.isClosed()) {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
    }

    // ---- WAIT & SCAN FOR LINK ----
    await page.waitForTimeout(5000);

    const downloadUrl = await page.evaluate(() => {
      const link =
        document.querySelector("a[href*='data.terabox']") ||
        document.querySelector("a[href*='download']") ||
        document.querySelector("a[href*='file']");
      return link ? link.href : null;
    });

    if (!downloadUrl) {
      await browser.close();
      return res.status(404).json({
        error: "❌ Download link not found",
        reason: "Maybe cookies expired or anti-bot triggered."
      });
    }

    await browser.close();

    return res.json({
      success: true,
      original: req.query.url,
      normalized: url,
      download: downloadUrl
    });

  } catch (err) {
    if (browser) await browser.close();
    return res.json({
      error: "❌ Failed",
      details: err.toString()
    });
  }
});

app.listen(PORT, () => console.log(`🚀 LIVE on port ${PORT}`));
