import puppeteer from "puppeteer";

const COOKIES_FILE = "./cookies.json";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: [
      "--no-sandbox",
      "--disable-web-security",
      "--disable-gpu",
      "--start-maximized"
    ]
  });

  const page = await browser.newPage();

  await page.goto("https://1024terabox.com", {
    waitUntil: "networkidle2",
    timeout: 0
  });

  console.log("⚠️ Login manually now...");
  console.log("👉 AFTER LOGIN, DO NOT CLOSE BROWSER YOURSELF. WAIT.");
  console.log("⏳ Saving cookies automatically in 30 sec...");

  // Wait for you to log in
 await new Promise(res => setTimeout(res, 30000));

  // Save cookies
  const cookies = await page.cookies();
  import('fs').then(fs => fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2)));
  
  console.log("✅ cookies.json saved successfully!");
  console.log("📁 Upload this file to Render or commit it to GitHub.");
  
  await browser.close();
})();
