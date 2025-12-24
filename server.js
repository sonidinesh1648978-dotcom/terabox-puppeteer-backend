import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 10000;
const COOKIE_FILE = "cookies.json";

/* -------------------- BASIC HEALTH CHECK -------------------- */
app.get("/", (req, res) => {
  res.send("Terabox Puppeteer Backend is running ✅");
});

/* -------------------- MANUAL LOGIN (ONE TIME) -------------------- */
app.get("/login", async (req, res) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
      headless: false, // MUST be false for manual login
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto("https://www.terabox.com", {
      waitUntil: "domcontentloaded",
      timeout: 0
    });

    res.send(`
      <h2>Terabox Login</h2>
      <p>Login in the opened browser window.</p>
      <p>After successful login, CLOSE the browser window.</p>
    `);

    // Wait until browser is closed manually
    await browser.waitForTarget(() => false);

  } catch (err) {
    res.status(500).send(err.message);
  } finally {
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const cookies = await pages[0].cookies();
          fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
        }
        await browser.close();
      } catch (_) {}
    }
  }
});

/* -------------------- FETCH TERABOX LINK -------------------- */
app.get("/fetch", async (req, res) => {
  const shareUrl = req.query.url;

  if (!shareUrl || !shareUrl.includes("terabox")) {
    return res.status(400).json({ error: "Invalid Terabox link" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    /* ---- LOAD SAVED LOGIN COOKIES ---- */
    if (fs.existsSync(COOKIE_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8"));
      await page.setCookie(...cookies);
    }

    let finalDownloadUrl = null;

    /* ---- INTERCEPT TERABOX API RESPONSES ---- */
    page.on("response", async response => {
      try {
        const url = response.url();
        if (
          url.includes("share") ||
          url.includes("list") ||
          url.includes("download")
        ) {
          const text = await response.text();
          const match = text.match(
            /https:\/\/data\.terabox\.app\/file\/[^"&]+/
          );
          if (match) {
            finalDownloadUrl = match[0];
          }
        }
      } catch (_) {}
    });

    await page.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 0
    });

    // Allow Terabox JS + API calls to complete
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (!finalDownloadUrl) {
      throw new Error("Download link not found (login may be expired)");
    }

    res.json({
      success: true,
      download: finalDownloadUrl
    });

  } catch (err) {
    res.status(500).json({
      error: "Failed to generate download link",
      details: err.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
