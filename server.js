import express from "express";
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const app = express();
const __dirname = path.resolve();
const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_PATH = path.join(__dirname, "cookies.json");

// ------------------ URL NORMALIZER (FINAL FIX) ------------------
function normalizeURL(url) {
  if (!url) return null;
  url = url.trim();

  // Remove double protocol
  url = url.replace(/https?:\/\/https?:\/\//gi, "https://");

  // Remove repeated domain patterns
  url = url.replace(/1024terabox\.com\/+1024terabox\.com/gi, "1024terabox.com");

  // Force https at start
  if (!url.startsWith("http")) url = "https://" + url;

  // Map all variations → main domain ONCE
  url = url
    .replace(/(https?:\/\/)?(www\.)?teraboxurl\.com/gi, "https://1024terabox.com")
    .replace(/(https?:\/\/)?(www\.)?terabox\.com/gi, "https://1024terabox.com");

  // Clean double slashes
  url = url.replace(/\/\/+/g, "/").replace("https:/", "https://");

  return url;
}

// ------------------ LAUNCH BROWSER SAFE FOR RENDER ------------------
async function launchBrowser() {
  return await puppeteer.launch({
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
      "--ignore-certificate-errors",
      "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
      "--window-size=1280,720",
      "--disable-web-security",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-extensions",
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36`
    ]
  });
}

// ------------------ SAFE GOTO ------------------
async function safeGoto(page, url) {
  const modes = ["networkidle2", "domcontentloaded", "load"];
  for (let m of modes) {
    try {
      console.log("⏳ Trying:", m);
      await page.goto(url, { waitUntil: m, timeout: 60000 });
      return true;
    } catch {
      console.log("⚠️ Retry:", m);
    }
  }
  return false;
}

// ------------------ DIAGNOSE ------------------
app.get("/diagnose", async (req, res) => {
  let cookies = fs.existsSync(COOKIES_PATH) ? "✅ Found" : "❌ Missing";
  try {
    const b = await launchBrowser();
    await b.close();
    res.json({ chromium: "🟢 Browser OK", cookies });
  } catch (e) {
    res.json({ chromium: "❌ Failed", cookies, error: e.message });
  }
});

// ------------------ MAIN FETCH ------------------
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "❌ Missing ?url=" });

  url = normalizeURL(url);
  console.log("🌍 Final URL:", url);

  const browser = await launchBrowser();
  const page = await browser.newPage();

  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
    await page.setCookie(...cookies);
    console.log("🍪 Cookies Applied");
  }

  const opened = await safeGoto(page, url);
  if (!opened) {
    await browser.close();
    return res.json({ error: "❌ Page blocked / cannot load" });
  }

  // Replace waitForTimeout with manual delay
  await new Promise(r => setTimeout(r, 5000));

  // -------- Extract URL only (NO CLICKING) --------
  const directLink = await page.evaluate(() => {
    return [...document.querySelectorAll("a")]
      .map(a => a.href)
      .find(x => x.includes("data.") && x.includes("file/"));
  });

  if (!directLink) {
    await browser.close();
    return res.json({
      error: "❌ No link found, login may have expired",
      fix: "Run login-local.js again"
    });
  }

  const title = (await page.title()).replace(/[^\w.-]/g, "_");

  await browser.close();
  res.json({
    success: true,
    filename: title + ".mp4",
    download: directLink
  });
});

// ------------------ SERVER ------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server Active on ${PORT}`));
