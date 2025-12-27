import express from "express";
import fs from "fs";
import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const COOKIES_FILE = path.join(__dirname, "cookies.json");
const CHROME_PATH = "/usr/bin/chromium"; // Render chromium path

//-----------------------------------
// URL FIX LOGIC
//-----------------------------------
function convertToDM(url) {
  if (!url || !url.includes("/s/")) return null;
  let token = url.split("/s/")[1].split("?")[0];

  // Fix "1b_" issue
  if (token.startsWith("1b_")) token = token.substring(1);

  return `https://dm.1024tera.com/sharing/link?surl=${token}&clearCache=1`;
}

//-----------------------------------
// PUPPETEER BOOT
//-----------------------------------
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1366,768",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });
}

//-----------------------------------
// LOAD WITH CLOUDFLARE RETRIES
//-----------------------------------
async function safeLoad(page, url) {
  const modes = ["networkidle2", "domcontentloaded", "load"];
  for (let m of modes) {
    try {
      console.log("⏳ Loading (mode):", m);
      await page.goto(url, { waitUntil: m, timeout: 60000 });
      return true;
    } catch {
      console.log("⚠️ Retry:", m);
    }
  }
  return false;
}

//-----------------------------------
// MAIN API
//-----------------------------------
app.get("/api", async (req, res) => {
  const input = req.query.url;
  const dmUrl = convertToDM(input);

  if (!dmUrl) return res.json({ error: "❌ Invalid or missing link" });
  console.log("➡ Visiting:", dmUrl);

  let cookies = [];
  if (fs.existsSync(COOKIES_FILE)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
    console.log("🍪 Cookies Applied");
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    if (cookies.length) await page.setCookie(...cookies);

    // Anti-block headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://1024terabox.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });

    // Navigate
    const loaded = await safeLoad(page, dmUrl);
    if (!loaded) throw new Error("Blocked or failed to load (Cloudflare/Timeout)");

    //--------------------------------------------------
    // CHECK IF LOGIN POPUP EXISTS
    //--------------------------------------------------
    const needLogin = await page.$("button[class*='login'], .login-btn, .sign-in");
    if (needLogin) {
      return res.json({
        error: "🔐 Login required",
        message: "Login cookie missing, run /login-local"
      });
    }

    //--------------------------------------------------
    // INTERCEPT NETWORK REQUESTS
    //--------------------------------------------------
    let finalLink = null;
    page.on("response", async (response) => {
      const url = response.url();
      if (
        url.includes("data.terabox.app/file") ||
        url.includes("download") ||
        url.includes("uc?id=")
      ) {
        finalLink = url;
        console.log("📩 Intercepted:", finalLink);
      }
    });

    //--------------------------------------------------
    // 1️⃣ DIRECT DOWNLOAD BUTTON
    //--------------------------------------------------
    const clickTargets = [
      "a[href*='download']", ".download-btn", ".btn-download", "#download",
      "[data-testid='download']", "button[class*='download']"
    ];
    for (let sel of clickTargets) {
      if (await page.$(sel)) {
        console.log("🖱 Clicking:", sel);
        await page.click(sel).catch(() => {});
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    //--------------------------------------------------
    // 2️⃣ PREVIEW MODE → UNLOCK HIDDEN LINK
    //--------------------------------------------------
    if (!finalLink) {
      const previewTargets = [
        ".video-player", ".play-button", "video", ".preview-btn"
      ];
      for (let p of previewTargets) {
        if (await page.$(p)) {
          console.log("▶ Unlocking via preview:", p);
          await page.click(p).catch(()=>{});
          await new Promise(r => setTimeout(r, 6000));
        }
      }
    }

    //--------------------------------------------------
    // RETURN RESULT
    //--------------------------------------------------
    if (!finalLink) {
      return res.json({
        error: "❌ Hidden link — cannot extract automatically",
        fix: "Cloudflare or paywall preventing direct link"
      });
    }

    return res.json({
      status: "🟢 Success",
      link: finalLink
    });

  } catch (err) {
    return res.json({ error: "❌ Failed", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

//-----------------------------------
// START SERVER
//-----------------------------------
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
