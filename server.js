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

// === CONFIG FOR RENDER ===
const PORT = process.env.PORT || 10000;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";
const COOKIES_PATH = path.join(__dirname, "cookies.json");

// === ACCEPTED DOMAINS ===
const ALLOWED_DOMAINS = [
  "1024terabox.com",
  "teraboxurl.com",
  "terabox.com",
  "mirrobox.com",
  "nephobox.com",
  "www.1024terabox.com",
  "www.teraboxurl.com"
];

// === HOME ROUTE ===
app.get("/", (req, res) => {
  res.json({
    status: "🟢 TeraBox Puppeteer API Running",
    endpoints: {
      diagnose: "/diagnose",
      loginCheck: "/check-login",
      fetch: "/fetch?url=YOUR_LINK"
    }
  });
});

// === CHECK LOGIN (COOKIES.JSON) ===
app.get("/check-login", (req, res) => {
  return res.json({
    logged_in: fs.existsSync(COOKIES_PATH),
    cookies_found: fs.existsSync(COOKIES_PATH) ? "✅ cookies.json found" : "❌ cookies.json missing",
    next_step: fs.existsSync(COOKIES_PATH)
      ? "Proceed to /fetch"
      : "Run login-local.js locally and commit cookies.json"
  });
});

// === DIAGNOSE CHROME + COOKIE STATUS ===
app.get("/diagnose", async (req, res) => {
  const report = {
    chromiumPath: CHROME_PATH,
    cookies: fs.existsSync(COOKIES_PATH) ? "✅ Found" : "❌ Missing",
    launch: "⏳ Checking..."
  };

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-setuid-sandbox"
      ],
    });

    await browser.close();
    report.launch = "🟢 Chromium launched successfully. Puppeteer OK!";
  } catch (err) {
    report.launch = "🔴 Failed to launch: " + err.message;
  }

  return res.json(report);
});

// === MAIN DOWNLOAD LOGIC ===
app.get("/fetch", async (req, res) => {
  let url = req.query.url;

  if (!url) return res.json({ error: "❌ Missing ?url=" });

  // AUTO-FIX SHORT LINKS
  url = url
    .replace("teraboxurl.com", "1024terabox.com")
    .replace("terabox.com", "1024terabox.com");

  // DOMAIN VALIDATION
  if (!ALLOWED_DOMAINS.some(domain => url.includes(domain))) {
    return res.json({
      error: "❌ Unsupported domain",
      allowed_domains: ALLOWED_DOMAINS
    });
  }

  // COOKIES CHECK
  if (!fs.existsSync(COOKIES_PATH)) {
    return res.json({
      error: "❌ cookies.json missing",
      solution: "Run login-local.js on your PC to generate it"
    });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-setuid-sandbox"
      ],
    });

    const page = await browser.newPage();
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
    await page.setCookie(...cookies);

    await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });

    // UPDATED SELECTORS FOR FILE INFO
    const fileName = await page.evaluate(() =>
      document.querySelector(".video-info-title,.filename,.usr-file-name")?.innerText
    );

    const downloadUrl = await page.evaluate(() => {
      const link = document.querySelector("a[href*='data.'], a[href*='download'], .btn-download");
      return link ? link.href : null;
    });

    if (!downloadUrl) {
      return res.json({
        error: "⛔ Download link not found - login expired",
        solution: "Re-run login-local.js and upload new cookies.json"
      });
    }

    return res.json({
      success: true,
      file: fileName || "Unknown File",
      download: downloadUrl,
      message: "⚡ Copy the link & download directly!"
    });

  } catch (err) {
    return res.json({ error: "❌ Failed to fetch file", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`🚀 TeraBox Backend Running on PORT ${PORT}`);
});
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`🚀 Puppeteer RUNNING on ${PORT}`));
