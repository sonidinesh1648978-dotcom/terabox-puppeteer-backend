import express from "express";
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const app = express();
app.use(express.json());

const __dirname = path.resolve();
const CHROME_PATH = "/usr/bin/chromium";
const COOKIES_FILE = path.join(__dirname, "cookies.json");

// ---------- DOMAIN NORMALIZER ----------
function normalize(url) {
  return url
    .replace(/(https?:\/\/)?(www\.)?teraboxurl\.com/gi, "https://1024terabox.com")
    .replace(/(https?:\/\/)?(www\.)?terabox\.com/gi, "https://1024terabox.com");
}

// ---------- LAUNCH CHROMIUM (Render Safe Settings) ----------
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
      "--disable-extensions",
      "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
      "--single-process",
      "--no-zygote",
      "--ignore-certificate-errors",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--window-size=1280,720",
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36`,
    ],
  });
}

// ---------- SAFE GOTO WITH RETRIES ----------
async function safeGoto(page, url) {
  const tries = [
    { waitUntil: "networkidle2", timeout: 60000 },
    { waitUntil: "domcontentloaded", timeout: 60000 },
    { waitUntil: "load", timeout: 60000 },
  ];
  for (let opt of tries) {
    try {
      await page.goto(url, opt);
      return true;
    } catch {
      console.log("⚠️ retry:", opt.waitUntil);
    }
  }
  return false;
}

// ---------- DIAGNOSE ROUTE ----------
app.get("/diagnose", async (req, res) => {
  const cookiesOK = fs.existsSync(COOKIES_FILE) ? "✅ Found" : "❌ Missing";
  let launch = "❌ Failed";
  try {
    const b = await launchBrowser();
    await b.close();
    launch = "🟢 Chromium launched successfully!";
  } catch (e) {
    launch = `❌ Launch failed: ${e.message}`;
  }

  res.json({
    chromiumPath: CHROME_PATH,
    cookies: cookiesOK,
    launch,
  });
});

// ---------- MAIN FETCH ROUTE ----------
app.get("/fetch", async (req, res) => {
  let url = req.query.url;
  if (!url) return res.json({ error: "❌ Provide ?url=" });

  url = normalize(url);
  console.log("🌐 Normalized:", url);

  const browser = await launchBrowser();
  let page = await browser.newPage();

  // Load cookies if present
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
    await page.setCookie(...cookies);
    console.log("🍪 Cookies Loaded");
  }

  // Anti-crash handlers
  page.on("error", () => {});
  page.on("pageerror", () => {});
  page.on("close", async () => {
    console.log("⚠️ Page closed, creating new tab...");
    page = await browser.newPage();
    await safeGoto(page, url);
  });

  // Try to open the link
  const ok = await safeGoto(page, url);
  if (!ok) {
    await browser.close();
    return res.json({ error: "❌ Failed", details: "Navigation blocked or dropped" });
  }

  // Cloudflare wait & blank page recovery
  await page.waitForTimeout(7000);
  const html = await page.content();
  if (html.length < 2500) {
    console.log("⚠️ blank page → retry load");
    await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(5000);
  }

  // Extract download link
  let download = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a")];
    return anchors.map(a => a.href).find(h => h.includes("data.") && h.includes("file/"));
  });

  if (!download) {
    await browser.close();
    return res.json({ error: "❌ No direct link found", hint: "Login expired or blocked page" });
  }

  const title = await page.title();
  await browser.close();

  return res.json({
    success: true,
    name: title.replace(/[^\w.-]/g, "_") + ".mp4",
    download
  });
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 LIVE on port ${PORT}`));
