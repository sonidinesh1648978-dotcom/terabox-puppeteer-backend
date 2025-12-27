import express from "express";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());
const app = express();
const PORT = process.env.PORT || 10000;

const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_FILE = "cookies.json";

// ------------------ DIAGNOSE ENDPOINT ------------------
app.get("/diagnose", async (req, res) => {
  const output = {
    chromiumPath: CHROME_PATH,
    cookies: fs.existsSync(COOKIES_FILE) ? "🍪 Found" : "❌ Missing cookies.json",
    stealth: puppeteer ? "🟢 Stealth Loaded" : "❌ Stealth NOT Loaded"
  };

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
    await browser.close();
    output.launch = "🟢 Chromium launched OK";
  } catch (e) {
    output.launch = `❌ Failed to launch: ${e.message}`;
  }

  return res.json(output);
});

// ------------------ URL FIXER ------------------
function normalizeURL(url) {
  if (!url) return null;
  url = url.trim();

  // Remove duplicated protocols
  url = url.replace(/https?:\/\/https?:\/\//gi, "https://");

  // Remove double 1024 prefixes
  url = url.replace(/1024https?:\/\//gi, "https://");

  // Remove accidental double domain
  url = url.replace(/https:\/\/1024terabox\.com\/1024terabox\.com/gi, "https://1024terabox.com");

  // Convert any terabox link to 1024 format
  url = url.replace(/https?:\/\/(www\.)?(terabox|teraboxurl)\.com/gi, "https://1024terabox.com");

  // Make sure only one prefix exists
  if (!url.startsWith("https://1024terabox.com")) {
    url = `https://1024terabox.com${url.replace(/.*1024terabox\.com/, "")}`;
  }

  return url;
}

// ------------------ BROWSER LAUNCH ------------------
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--single-process",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,720",
      "--ignore-certificate-errors",
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
    ],
  });
}

// ------------------ SAFE GOTO ------------------
async function safeGoto(page, url) {
  const tries = ["networkidle2", "domcontentloaded", "load"];
  for (const cond of tries) {
    try {
      await page.goto(url, { waitUntil: cond, timeout: 15000 });
      return true;
    } catch {
      console.log(`⚠️ Retry: ${cond}`);
    }
  }
  return false;
}

// ------------------ MAIN ROUTE ------------------
app.get("/api", async (req, res) => {
  let url = normalizeURL(req.query.url);
  if (!url) return res.json({ error: "❌ Provide link: ?url=" });

  console.log("🌍 Final URL:", url);

  // Load cookies if available
  let cookies = [];
  if (fs.existsSync(COOKIES_FILE)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
    console.log("🍪 Cookies Applied");
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Apply cookies
    if (cookies.length) await page.setCookie(...cookies);

    // Extra headers to avoid blocks
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://1024terabox.com/",
      "DNT": "1"
    });
    
    await page.setExtraHTTPHeaders({
    "referer": "https://1024terabox.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9"
    });

    // Navigate
    const ok = await safeGoto(page, url);
    if (!ok) throw new Error("Blocked or page not loaded");

    // Wait a bit (replacement for waitForTimeout)
    await new Promise(res => setTimeout(res, 5000));

    // Try to extract any visible link
    const link = await page.evaluate(() => {
      const a = document.querySelector("a[href*='download']");
      return a ? a.href : null;
    });

    if (!link) return res.json({ error: "❌ No direct download link found" });

    return res.json({ status: "🟢 Success", link });

  } catch (err) {
    console.log("❌ ERROR:", err.message);
    return res.json({ error: "❌ Failed", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ------------------ START ------------------
app.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
