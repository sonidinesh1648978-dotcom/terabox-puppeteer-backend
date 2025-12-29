import express from "express";
import fs from "fs";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;

const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_FILE = "cookies.json";

// ---------------- URL NORMALIZER ----------------
function normalizeURL(url) {
  if (!url) return null;
  url = url.trim();

  // Fix doubled https
  url = url.replace(/https?:\/\/https?:\/\//gi, "https://");

  // Convert all domains to correct host
  url = url.replace(/https?:\/\/(www\.)?(teraboxurl|terabox|1024tera|1024terabox)\.com/gi,
    "https://www.1024tera.com"
  );

  // Extract surl if missing
  const match = url.match(/s\/([^?]+)/);
  if (match) {
    return `https://www.1024tera.com/sharing/link?surl=${match[1]}&clearCache=1`;
  }

  return url;
}

// ---------------- SAFE BROWSER ----------------
async function startBrowser() {
  return await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--window-size=1280,720"
    ]
  });
}

// ---------------- API ROUTE ----------------
app.get("/api", async (req, res) => {
  let sharedLink = req.query.url;
  if (!sharedLink) return res.json({ error: "❌ Provide link: ?url=" });

  const url = normalizeURL(sharedLink);
  console.log("🌍 Final URL:", url);

  // Load cookies if available
  let cookies = [];
  if (fs.existsSync(COOKIES_FILE)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
    console.log("🍪 Cookies Loaded");
  }

  let browser;
  try {
    browser = await startBrowser();
    const page = await browser.newPage();

    // Apply cookies (optional login)
    if (cookies.length) await page.setCookie(...cookies);

    await page.setExtraHTTPHeaders({
      "Referer": "https://www.1024tera.com/",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Chrome/120.0"
    });

    let downloadURL = null;

    // 🔍 Capture real download API from network
    page.on("request", (req) => {
      const reqUrl = req.url();

      // Detect useful endpoints
      if (
        reqUrl.includes("download") ||
        reqUrl.includes("get") && reqUrl.includes("file") ||
        reqUrl.includes("data.terabox") ||
        reqUrl.includes("file") && reqUrl.includes("sign")
      ) {
        console.log("🔎 Captured:", reqUrl);
        downloadURL = reqUrl;
      }
    });

    // ---------------- LOAD PAGE ----------------
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 5000)); // Wait for analytics requests

    // ---------------- RESULT ----------------
    if (!downloadURL) {
      return res.json({
        error: "❌ Hidden link — requires login or Cloudflare pass",
        note: "Manual login in browser may be required to store cookies.json"
      });
    }

    return res.json({
      status: "🟢 SUCCESS",
      directLink: downloadURL
    });

  } catch (err) {
    console.log("❌ ERROR:", err.message);
    return res.json({ error: "❌ Failed", message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ---------------- RUN ----------------
app.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});
