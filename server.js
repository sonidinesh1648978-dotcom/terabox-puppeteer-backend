import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;

// 🟢 GLOBAL BROWSER INSTANCE (Render safe)
let browser;

// 🟢 Launch Puppeteer only once on boot
async function initBrowser() {
  if (browser) return browser;

  browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-zygote",
    ],
  });

  console.log("✔ Puppeteer Browser Launched");
  return browser;
}

// 🟢 Start Welcome Route
app.get("/", (req, res) => {
  res.send("🟢 Terabox Puppeteer Backend Running. Use /fetch?url=YOUR_LINK");
});

// 🟢 Fetch Download Link Route
app.get("/fetch", async (req, res) => {
  const link = req.query.url;

  if (!link || !link.includes("1024terabox")) {
    return res.json({ error: "❌ Provide a valid 1024Terabox link: ?url=" });
  }

  try {
    const browser = await initBrowser();
    const page = await browser.newPage();

    // 🟡 LOAD COOKIES
    if (fs.existsSync("cookies.json")) {
      const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
      await page.setCookie(...cookies);
      console.log("🔐 Cookies Loaded");
    } else {
      return res.json({ error: "❌ cookies.json missing! Run login-local.js again." });
    }

    // 🟡 Go to Link
    await page.goto(link, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });

    // 🟡 Check if login expired
    if (await page.$("input[type=password], #login-frame, .login-box")) {
      return res.json({ error: "⛔ Session expired. Re-run login-local.js to refresh cookies." });
    }

    // 🟢 Wait for the internal request that contains the download link
    await page.waitForResponse(
      (response) =>
        response.url().includes("download") &&
        response.status() === 200,
      { timeout: 120000 }
    );

    const downloadRequest = await page.waitForResponse(
      (response) => response.url().includes("download"),
      { timeout: 120000 }
    );

    const downloadUrl = downloadRequest.url();

    // 🟢 Extract file name + size from page
    const fileName = await page.title();
    const size = await page.evaluate(() => {
      const el = document.querySelector(".size, .video-size, .info-size, .detail-size");
      return el ? el.innerText : "Unknown Size";
    });

    console.log("✔ Download Found:", downloadUrl);

    return res.json({
      success: true,
      name: fileName || "Unknown file",
      size: size,
      download: downloadUrl,
    });

  } catch (err) {
    console.log("❌ ERROR:", err);
    return res.json({
      error: "Failed to fetch Terabox link",
      details: err.message,
    });
  }
});

// 🟢 Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
