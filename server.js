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

// Detect Chromium on Render
const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  "/usr/bin/chromium" ||
  "/usr/bin/chromium-browser";

// ---------- DOMAIN NORMALIZER ----------
function normalizeTerabox(url) {
  if (!url) return null;
  return url
    .replace(/https?:\/\/(www\.)?teraboxurl\.com/i, "https://1024terabox.com")
    .replace(/https?:\/\/(www\.)?terabox\.com/i, "https://1024terabox.com");
}

// ---------- DIAGNOSTICS ----------
app.get("/diagnose", async (req, res) => {
  try {
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        executablePath: CHROME_PATH,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      await browser.close();
      return res.json({
        chromiumPath: CHROME_PATH,
        cookies: fs.existsSync(COOKIES_PATH) ? "Found" : "Missing",
        launch: "🟢 Chromium launched successfully!"
      });
    } catch (e) {
      return res.json({
        chromiumPath: CHROME_PATH,
        cookies: fs.existsSync(COOKIES_PATH) ? "Found" : "Missing",
        launch: "❌ Launch failed: " + e.message
      });
    }
  } catch (err) {
    res.json({ error: "Unexpected", details: err.toString() });
  }
});

// ---------- MAIN API ----------
app.get("/fetch", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: "❌ Provide ?url=",
      example:
        "/fetch?url=https://teraboxurl.com/s/xxxxxxx"
    });
  }

  url = normalizeTerabox(url); // fix domain
  console.log("➡ Normalized URL:", url);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      ignoreHTTPSErrors: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--window-size=1280,720",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      ]
    });

    const page = await browser.newPage();

    // Anti-bot bypass
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://1024terabox.com/",
      "Cache-Control": "no-cache"
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    });

    // Load saved login cookies
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
      await page.setCookie(...cookies);
    }

    // FIRST TRY
    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 120000
      });
    } catch (_) {
      // FALLBACK TRY
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 120000
      });
    }

    // HANDLE EMPTY PAGE
    if ((await page.content()).length < 3000) {
      await page.reload({ waitUntil: "networkidle2" });
    }

    // WAIT FOR POSSIBLE BUTTON
    await page.waitForTimeout(5000);

    // EXTRACT DOWNLOAD LINK
    const downloadUrl = await page.evaluate(() => {
      const btn =
        document.querySelector("a[href*='data.terabox']") ||
        document.querySelector("a[href*='download']") ||
        document.querySelector("a[href*='file']");
      return btn ? btn.href : null;
    });

    if (!downloadUrl) {
      await browser.close();
      return res.status(404).json({
        error: "❌ Download link not found",
        hint: "Maybe cookies expired? Re-login with login-local.js"
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

app.listen(PORT, () =>
  console.log(`🚀 Server LIVE on port ${PORT}`)
);
