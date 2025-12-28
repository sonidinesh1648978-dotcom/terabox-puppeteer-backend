import express from "express";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import Stealth from "puppeteer-extra-plugin-stealth";
import puppeteerExtra from "puppeteer-extra";

const app = express();
const PORT = process.env.PORT || 10000;
const CHROME_PATH = "/usr/bin/chromium";
const COOKIE_FILE = "cookies.json";

puppeteerExtra.use(Stealth());

// Normalize and convert TeraBox link → DM link
function convert(url) {
  if (!url) return null;

  url = url.trim()
           .replace(/https?:\/\/https?:\/\//g, "https://")
           .replace(/1024https?:\/\//g, "https://")
           .replace(/teraboxurl\.com|terabox\.com/gi, "1024terabox.com");

  const token = url.split("/s/")[1]?.split("?")[0];
  if (!token) return null;
  const clean = token.startsWith("1") ? token.slice(1) : token;

  return `https://dm.1024tera.com/sharing/link?surl=${clean}&clearCache=1`;
}

// Launch with stealth
async function launch() {
  return puppeteerExtra.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1280,720",
      "--single-process"
    ]
  });
}

// MAIN API
app.get("/api", async (req, res) => {
  const raw = req.query.url;
  const target = convert(raw);
  if (!target) return res.json({ error: "❌ Invalid link format" });

  console.log("➡ Visiting:", target);

  let cookies = [];
  if (fs.existsSync(COOKIE_FILE)) {
    cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8"));
    console.log("🍪 Cookies Loaded");
  }

  let browser;
  let finalLink = null;

  try {
    browser = await launch();
    const page = await browser.newPage();

    if (cookies.length) await page.setCookie(...cookies);

    // Intercept network & capture request URL
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (
        u.includes("data.terabox") ||
        u.includes("download") ||
        u.includes("file/") ||
        u.includes("context") ||
        u.includes(".app/")
      ) {
        console.log("🎯 Captured:", u);
        finalLink = u;
      }
      req.continue().catch(() => {});
    });

    // Load
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25000 });

    // Try Clicking Download / Downloads
    const buttons = [
      "button:has-text('Download')",
      "button:has-text('Downloads')",
      "a:has-text('Download')",
      "a:has-text('Downloads')"
    ];

    for (const b of buttons) {
      try {
        await page.click(b);
        break;
      } catch {}
    }

    // Let requests trigger
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 20000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 2500));

    // Return result
    if (!finalLink) {
      return res.json({
        error: "❌ Hidden or protected link.",
        cause: "Needs proper login cookies or cannot extract automatically."
      });
    }

    return res.json({ status: "🟢 Success", download: finalLink });

  } catch (err) {
    return res.json({ error: "❌ Failed", message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
