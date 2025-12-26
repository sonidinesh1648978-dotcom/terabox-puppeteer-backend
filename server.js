import express from "express";
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const app = express();
const __dirname = path.resolve();
const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_PATH = path.join(__dirname, "cookies.json");

// ----------------- URL FIXER -----------------
function normalizeURL(url) {
  if (!url) return null;
  url = url.trim();

  // remove accidental double domains: "https://1024https://1024..."
  url = url.replace(/1024https?:\/\/1024/gi, "https://1024terabox.com");

  // add missing protocol
  if (!url.startsWith("http")) url = "https://" + url;

  // convert short links → main domain ONCE
  url = url
    .replace(/(https?:\/\/)?(www\.)?teraboxurl\.com/gi, "https://1024terabox.com")
    .replace(/(https?:\/\/)?(www\.)?terabox\.com/gi, "https://1024terabox.com");

  // fix double https://
  url = url.replace(/^https?:\/\/https?:\/\//, "https://");

  return url;
}

// ----------------- BROWSER LAUNCH (RENDER SAFE) -----------------
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
      "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
      "--ignore-certificate-errors",
      "--window-size=1280,720",
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36`,
    ]
  });
}

// ----------------- SAFE PAGE LOADING -----------------
async function safeGoto(page, url) {
  const modes = ["networkidle2", "domcontentloaded", "load"];
  for (let mode of modes) {
    try {
      console.log("⏳ Trying load:", mode);
      await page.goto(url, { waitUntil: mode, timeout: 60000 });
      return true;
    } catch (err) {
      console.log("⚠️ retry:", mode);
    }
  }
  return false;
}

// ----------------- DIAGNOSE -----------------
app.get("/diagnose", async (req, res) => {
  let result = {
    chromiumPath: CHROME_PATH,
    cookies: fs.existsSync(COOKIES_PATH) ? "✅ Found" : "❌ Missing",
  };
  try {
    const b = await launchBrowser();
    await b.close();
    result.launch = "🟢 OK - Chromium launched";
  } catch (e) {
    result.launch = "❌ Failed to launch: " + e.message;
  }
  res.json(result);
});

// ----------------- MAIN API (NO CLICK, JUST EXTRACT LINK) -----------------
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "❌ Missing ?url=" });

  url = normalizeURL(url);
  if (!url.includes("1024terabox")) {
    return res.json({ error: "❌ Invalid link", fixed: normalizeURL(url) });
  }

  console.log("🌎 Final URL:", url);

  const browser = await launchBrowser();
  let page = await browser.newPage();

  // apply cookies if login is available
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
      await page.setCookie(...cookies);
      console.log("🍪 Cookies Applied");
    } catch (e) {
      console.log("❌ Bad cookie file");
    }
  }

  // prevent crash if target closes
  page.on("close", async () => {
    console.log("⚠️ Page closed - reopening");
    page = await browser.newPage();
    await safeGoto(page, url);
  });

  const opened = await safeGoto(page, url);
  if (!opened) {
    await browser.close();
    return res.json({ error: "❌ Page blocked or not reachable" });
  }

  await page.waitForTimeout(5000); // anti-bot wait

  // ----------------- Extract WITHOUT clicking -----------------
  const downloadLink = await page.evaluate(() => {
    return [...document.querySelectorAll("a")]
      .map(a => a.href)
      .find(h => h.includes("data.") && h.includes("file/"));
  });

  if (!downloadLink) {
    await browser.close();
    return res.json({
      error: "❌ No direct link found (Login may be required)",
      note: "Run login-local.js again"
    });
  }

  const title = await page.title();
  await browser.close();

  res.json({
    success: true,
    filename: title.replace(/[^\w.-]/g, "_") + ".mp4",
    download: downloadLink
  });
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server Live on ${PORT}`));
