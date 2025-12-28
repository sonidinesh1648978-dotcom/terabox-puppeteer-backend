import express from "express";
import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerCore from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const CHROME_PATH = "/usr/bin/chromium";     // Render chromium path
const COOKIE_FILE = "cookies.json";

puppeteer.use(StealthPlugin());

// 🔧 URL FIXER
function fixURL(input) {
  if (!input) return null;
  let url = input.trim();

  // Remove repeated prefixes
  url = url.replace(/https?:\/\/https?:\/\//gi, "https://");
  url = url.replace(/1024https?:\/\//gi, "https://");
  url = url.replace(/https:\/\/1024https/gi, "https://");

  // Convert teraboxurl → 1024tera
  url = url.replace(/teraboxurl\.com|terabox\.com/gi, "1024terabox.com");

  // Extract token
  const token = url.split("/s/")[1]?.split("?")[0];
  if (!token) return null;

  // Some links start with "1" but should not
  const finalToken = token.startsWith("1") ? token.substring(1) : token;

  // Build DM link
  return `https://dm.1024tera.com/sharing/link?surl=${finalToken}&clearCache=1`;
}

// 🚀 Launch Stealth Browser
async function openBrowser() {
  return puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,720"
    ],
  });
}

// 🔁 Retry Navigation (Fix Timeout)
async function loadPage(page, url) {
  const modes = ["networkidle2", "domcontentloaded", "load"];
  for (let m of modes) {
    try {
      console.log(`⏳ Loading with: ${m}`);
      await page.goto(url, { waitUntil: m, timeout: 60000 });
      return true;
    } catch (e) {
      console.log("⚠️ Retry mode:", m);
    }
  }
  return false;
}

// 📌 API ROUTE
app.get("/api", async (req, res) => {
  const rawURL = req.query.url;
  const dmURL = fixURL(rawURL);

  if (!dmURL) return res.json({ error: "❌ Invalid link format" });

  console.log("🌍 Final URL:", dmURL);

  let browser;
  let finalLink = null;

  try {
    browser = await openBrowser();
    const page = await browser.newPage();

    // Load cookies
    if (fs.existsSync(COOKIE_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE));
      await page.setCookie(...cookies);
      console.log("🍪 Cookies Loaded");
    }

    // Anti-block headers
    await page.setExtraHTTPHeaders({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "referer": "https://1024terabox.com/",
      "accept-language": "en-US,en;q=0.9"
    });

    // Network Request Capture
    page.setRequestInterception(true);
    page.on("request", req => {
      const u = req.url();
      if (
        u.includes("file/") ||
        u.includes("data.terabox") ||
        u.includes("download") ||
        u.includes("context")
      ) {
        console.log("🎯 Captured:", u);
        finalLink = u;
      }
      req.continue().catch(() => {});
    });

    // Visit page with retry
    const ok = await loadPage(page, dmURL);
    if (!ok) return res.json({ error: "❌ Navigation Timeout", hint: "Site blocked Render IP" });

    // Try clicking download buttons
    const buttons = [
      "button:has-text('Download')",
      "a:has-text('Download')",
      "button:has-text('Downloads')",
      "a:has-text('Downloads')"
    ];

    for (let b of buttons) {
      try { await page.click(b); break; } catch {}
    }

    // Wait for requests
    await page.waitForNetworkIdle({ idleTime: 1200, timeout: 10000 }).catch(()=>{});

    // Return link
    if (!finalLink) {
      return res.json({
        error: "❌ File found but download link hidden",
        reason: "Login needed or IP blocked"
      });
    }

    return res.json({ status: "🟢 Success", download: finalLink });

  } catch (e) {
    return res.json({ error: "❌ Failed", message: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ▶ Start Server
app.listen(PORT, () => console.log(`🚀 API Running on port ${PORT}`));
