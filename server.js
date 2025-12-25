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

// ---------- CONFIG ----------
const PORT = process.env.PORT || 10000;
const COOKIES_PATH = path.join(__dirname, "cookies.json");
const ALLOWED_DOMAINS = [
  "1024terabox.com",
  "teraboxurl.com",
  "terabox.com",
  "mirrobox.com",
  "nephobox.com"
];

// ---------- ROUTES ----------

// Home Test
app.get("/", (req, res) => {
  res.json({ status: "🟢 Backend running!", usage: "/fetch?url=your_link" });
});

// Main Fetch Route
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "❌ Missing parameter: /fetch?url=" });

  // Validate input link
  if (!ALLOWED_DOMAINS.some(domain => url.includes(domain))) {
    return res.json({ 
      error: "❌ Invalid link!",
      supported: ALLOWED_DOMAINS.join(", ")
    });
  }

  // Normalize link
  url = url
    .replace("teraboxurl.com", "1024terabox.com")
    .replace("www.terabox.com", "www.1024terabox.com")
    .replace("terabox.com", "1024terabox.com")
    .replace("mirrobox.com", "1024terabox.com")
    .replace("nephobox.com", "1024terabox.com");

  console.log("🔁 Normalized URL:", url);

  let browser;
  try {
    // ---------- LAUNCH BROWSER (Render Safe Mode) ----------
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = await browser.newPage();

    // ---------- LOAD COOKIES ----------
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
      for (const cookie of cookies) {
        await page.setCookie(cookie);
      }
      console.log("🍪 Cookies loaded");
    } else {
      console.log("⚠️ No cookies.json found, login session missing.");
      return res.json({ error: "Not logged in. Upload cookies.json first." });
    }

    // ---------- OPEN SHARE PAGE ----------
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });

    // Wait for file load elements
    await page.waitForSelector(".video-info-title, .filename, .mstr-share-viewer", { timeout: 60000 }).catch(() => {});

    // Get file name
    const fileName = await page.evaluate(() =>
      document.querySelector(".video-info-title, .filename")?.innerText || "Unknown File"
    );

    // Attempt to extract download URL
    const downloadUrl = await page.evaluate(() => {
      const link = document.querySelector("a[href*='data.terabox'], a[href*='file']");
      return link ? link.href : null;
    });

    if (!downloadUrl) {
      return res.json({ 
        error: "Download link not found ⛔",
        reason: "Maybe countdown / protection active. Refresh cookie."
      });
    }

    // ---------- SEND RESULT ----------
    res.json({
      success: true,
      file: fileName,
      download: downloadUrl
    });

  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.json({ error: "Failed to generate download link", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ---------- START SERVER ----------
app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
