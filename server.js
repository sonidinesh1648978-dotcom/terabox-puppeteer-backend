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

// -----------------------------------------
// REQUIRED CONFIG
// -----------------------------------------
const PORT = process.env.PORT || 10000;
const COOKIES_PATH = path.join(__dirname, "cookies.json");

// MATCHES DOCKERFILE CHROMIUM PATH
const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

// SUPPORTED TeraBox MIRROR DOMAINS
const ALLOWED_DOMAINS = [
  "1024terabox.com",
  "teraboxurl.com",
  "terabox.com",
  "mirrobox.com",
  "nephobox.com",
  "www.1024terabox.com",
  "www.teraboxurl.com"
];

// -----------------------------------------
// HOME ROUTE
// -----------------------------------------
app.get("/", (req, res) => {
  res.json({
    status: "🟢 Backend Running",
    usage: {
      diagnose: "/diagnose",
      login: "/check-login",
      fetch: "/fetch?url=YOUR_LINK"
    }
  });
});

// -----------------------------------------
// COOKIE CHECK
// -----------------------------------------
app.get("/check-login", (req, res) => {
  res.json({
    login: fs.existsSync(COOKIES_PATH) ? "🟢 cookies.json found" : "🔴 missing cookies.json",
    next: fs.existsSync(COOKIES_PATH)
      ? "Use /fetch?url=..."
      : "Run login-local.js and upload cookies.json"
  });
});

// -----------------------------------------
// DIAGNOSTICS - CHROME + COOKIES
// -----------------------------------------
app.get("/diagnose", async (req, res) => {
  let status = {
    chromiumPath: CHROME_PATH,
    cookies: fs.existsSync(COOKIES_PATH) ? "✅ Found" : "❌ Missing",
    launch: "⏳ Checking..."
  };

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    await browser.close();

    status.launch = "🟢 Chromium launched successfully!";
  } catch (err) {
    status.launch = "🔴 Launch failed → " + err.message;
  }

  res.json(status);
});

// -----------------------------------------
// MAIN DOWNLOAD FETCH
// -----------------------------------------
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "❌ Missing ?url=" });

  // AUTO FIX LINK
  url = url
    .replace("teraboxurl.com", "1024terabox.com")
    .replace("terabox.com", "1024terabox.com");

  // DOMAIN CHECK
  if (!ALLOWED_DOMAINS.some(d => url.includes(d))) {
    return res.json({ error: "❌ Invalid domain", allowed: ALLOWED_DOMAINS });
  }

  // COOKIE CHECK
  if (!fs.existsSync(COOKIES_PATH)) {
    return res.json({
      error: "❌ cookies.json not found",
      fix: "Run login-local.js to generate it"
    });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const page = await browser.newPage();
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
    await page.setCookie(...cookies);

    // OPEN LINK
    await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });

    // FILE NAME
    const fileName = await page.evaluate(() =>
      document.querySelector(".video-info-title,.filename,.usr-file-name")?.innerText
    );

    // DOWNLOAD LINK
    const downloadUrl = await page.evaluate(() => {
      let btn =
        document.querySelector("a[href*='download']") ||
        document.querySelector("a[href*='data.']") ||
        document.querySelector(".btn-download");
      return btn?.href || null;
    });

    if (!downloadUrl) {
      return res.json({
        error: "⛔ Download link not found (login expired)",
        fix: "Run login-local.js again and update cookies.json"
      });
    }

    return res.json({
      success: true,
      file: fileName || "Unknown File",
      download: downloadUrl,
      message: "⚡ Copy link & download"
    });

  } catch (err) {
    return res.json({ error: "❌ Failed", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// -----------------------------------------
app.listen(PORT, () =>
  console.log(`🚀 Terabox backend running on PORT ${PORT}`)
);
