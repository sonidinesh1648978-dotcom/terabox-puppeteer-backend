// auto-cookie-updater.js
import fs from "fs";
import os from "os";
import puppeteer from "puppeteer-core";

const COOKIES_FILE = "cookies.json";
const LOGIN_URL = "https://www.1024tera.com";

// 🔍 Detect correct Chrome path
let CHROME_PATH;

// Windows (Your PC)
if (os.platform() === "win32") {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  CHROME_PATH = paths.find(p => fs.existsSync(p));

  if (!CHROME_PATH) {
    console.log("❌ Chrome not found on Windows!");
    console.log("➡ Install Chrome or provide its path manually.");
    process.exit(1);
  }
}

// Render / Linux server
else {
  CHROME_PATH = "/usr/bin/chromium";
}

console.log("🛰 Using Chrome path:", CHROME_PATH);


async function updateCookies() {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    console.log("\n🔐 Login manually, DO NOT CLOSE browser.");
    console.log("⏳ Cookies will auto-save once login completes...\n");

    const checkInterval = setInterval(async () => {
      const loggedIn = await page.evaluate(() =>
        !!document.querySelector("img.avatar, .user-info, .username, .nickname")
      );

      if (loggedIn) {
        clearInterval(checkInterval);

        const cookies = await page.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

        console.log("🍪 Cookies saved to cookies.json");
        await browser.close();
        process.exit(0);
      }
    }, 3000);

  } catch (err) {
    console.log("\n❌ Auto-cookie updater failed:");
    console.log(err.message);
  }
}

updateCookies();