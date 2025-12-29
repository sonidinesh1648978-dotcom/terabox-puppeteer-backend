import fs from "fs";
import puppeteer from "puppeteer-core";

const CHROME_PATH = "/usr/bin/chromium"; // Render / Linux
const COOKIES_FILE = "cookies.json";
const LOGIN_URL = "https://www.1024tera.com/login";

async function updateCookies() {
  console.log("🚀 Launching browser for login...");
  const browser = await puppeteer.launch({
    headless: false, // 👈 MUST stay visible for manual login
    executablePath: CHROME_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1280,780"
    ]
  });

  const page = await browser.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

  console.log("🟡 Please log in manually...");
  console.log("👉 After logging in, DO NOT close the browser yourself.");
  console.log("⏳ The system will detect login and save cookies automatically.");

  // 🔍 Check login every 3 seconds
  const checkLogin = setInterval(async () => {
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector("img.avatar, .user-info, .nickname, .username");
    });

    if (isLoggedIn) {
      clearInterval(checkLogin);

      // 🟢 Save Cookies
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

      console.log("🍪 Cookies updated successfully!");
      console.log("💾 Saved to:", COOKIES_FILE);

      // 🔐 Close after save
      setTimeout(async () => {
        await browser.close();
        console.log("✅ Browser closed. Login complete.");
        process.exit(0);
      }, 3000);
    }
  }, 3000);
}

updateCookies().catch(err => {
  console.error("❌ Auto-cookie updater error:", err);
});
