import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ==== CONFIG (REQUIRED FOR RENDER) ====
const PORT = process.env.PORT || 10000;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";
const COOKIES_PATH = path.join(__dirname, "cookies.json");

const ALLOWED_DOMAINS = [
  "1024terabox.com", "teraboxurl.com", "mirrobox.com",
  "nephobox.com", "terabox.com"
];

// ==== HOME ====
app.get("/", (req, res) => {
  res.json({
    status: "🟢 Server Online",
    use: "/fetch?url=YOUR_LINK",
    loginCheck: "/check-login"
  });
});

// ==== CHECK LOGIN ====
app.get("/check-login", (req, res) => {
  if (!fs.existsSync(COOKIES_PATH)) {
    return res.json({ logged: false, message: "❌ No cookies.json found." });
  }
  res.json({ logged: true, message: "✅ Cookies detected. Ready!" });
});

// ==== FETCH DOWNLOAD ====
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "Missing: /fetch?url=" });

  // fix link formats
  url = url
    .replace("teraboxurl.com", "1024terabox.com")
    .replace("www.terabox.com", "www.1024terabox.com")
    .replace("terabox.com", "1024terabox.com");

  if (!ALLOWED_DOMAINS.some(d => url.includes(d))) {
    return res.json({ error: "❌ Unsupported Link", allowed: ALLOWED_DOMAINS });
  }

  if (!fs.existsSync(COOKIES_PATH)) {
    return res.json({ error: "❌ Login cookies missing. Upload cookies.json" });
  }

  let browser;
  try {
    // === START CHROME ===
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: [
        "--no-sandbox", "--disable-dev-shm-usage",
        "--disable-setuid-sandbox", "--disable-gpu",
        "--single-process"
      ],
    });

    const page = await browser.newPage();
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
    await page.setCookie(...cookies);

    // === OPEN SHARE PAGE ===
    await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });

    // FIXED SELECTORS
    const fileName = await page.evaluate(() =>
      document.querySelector(".video-info-title,.filename,.usr-file-name")?.innerText
    );

    const downloadUrl = await page.evaluate(() => {
      let a = document.querySelector("a[href*='data.terabox'],a[href*='download'],.btn-download");
      return a ? a.href : null;
    });

    if (!downloadUrl) {
      return res.json({
        error: "⛔ Download link not visible",
        fix: "Open login-local.js and refresh cookies.json"
      });
    }

    res.json({
      success: true,
      file: fileName,
      download: downloadUrl
    });

  } catch (err) {
    res.json({ error: "Failed to fetch", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`🚀 Puppeteer RUNNING on ${PORT}`));
