import express from "express";
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const app = express();
const __dirname = path.resolve();
const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_PATH = path.join(__dirname, "cookies.json");

// ------------------ URL NORMALIZER (FIXED) ------------------
function normalizeURL(url) {
  if (!url) return null;
  url = url.trim();

  // Remove double protocol mistakes
  url = url.replace(/https?:\/\/https?:\/\//gi, "https://");

  // Remove "10241024" duplicate bug
  url = url.replace(/1024https:\/\/1024/gi, "https://1024terabox.com");

  // Add missing https
  if (!url.startsWith("http")) url = "https://" + url;

  // Convert known short domains -> once only
  url = url
    .replace(/(https?:\/\/)?(www\.)?teraboxurl\.com/gi, "https://1024terabox.com")
    .replace(/(https?:\/\/)?(www\.)?terabox\.com/gi, "https://1024terabox.com");

  // Ensure final cleaned correct format
  if (!url.startsWith("https://1024terabox.com")) {
    url = url.replace(/^https?:\/\/[^/]+/, "https://1024terabox.com");
  }

  return url;
}

// ------------------ BROWSER LAUNCH (RENDER SAFE) ------------------
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
    ],
  });
}

// ------------------ SAFE PAGE LOADING WITH RETRIES ------------------
async function safeGoto(page, url) {
  const modes = ["networkidle2", "domcontentloaded", "load"];
  for (let m of modes) {
    try {
      console.log("⏳ Trying:", m);
      await page.goto(url, { waitUntil: m, timeout: 60000 });
      return true;
    } catch (e) {
      console.log("⚠️ Failed:", m);
    }
  }
  return false;
}

// ------------------ DIAGNOSE ------------------
app.get("/diagnose", async (req, res) => {
  const cookies = fs.existsSync(COOKIES_PATH) ? "✅ Found" : "❌ Missing";
  try {
    const b = await launchBrowser();
    await b.close();
    return res.json({ chromiumPath: CHROME_PATH, cookies, status: "🟢 Chromium OK" });
  } catch (e) {
    return res.json({ chromiumPath: CHROME_PATH, cookies, status: "❌ Browser failed", error: e.message });
  }
});

// ------------------ MAIN FETCH (NO CLICK, EXTRACT ONLY) ------------------
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "❌ Missing ?url parameter" });

  url = normalizeURL(url);
  console.log("🌍 Final URL:", url);

  const browser = await launchBrowser();
  const page = await browser.newPage();

  // load cookies if login exists
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
      await page.setCookie(...cookies);
      console.log("🍪 Cookies applied.");
    } catch {}
  }

  // load page
  const open = await safeGoto(page, url);
  if (!open) {
    await browser.close();
    return res.json({ error: "❌ Navigation blocked or failed to load" });
  }

  await page.waitForTimeout(5000);

  // extract direct file URL
  const download = await page.evaluate(() => {
    return [...document.querySelectorAll("a")]
      .map(a => a.href)
      .find(x => x.includes("data.") && x.includes("file/"));
  });

  if (!download) {
    await browser.close();
    return res.json({ 
      error: "❌ No direct URL found",
      reason: "Probably cookie expired. Run login-local.js again."
    });
  }

  const title = await page.title();
  await browser.close();

  return res.json({
    success: true,
    filename: title.replace(/[^\w.-]/g, "_") + ".mp4",
    download
  });
});

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 RUNNING on port", PORT));
