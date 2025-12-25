import puppeteer from "puppeteer";
import fs from "fs";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: [
      "--window-size=1200,800",
      "--disable-web-security",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  const page = await browser.newPage();
  await page.goto("https://www.1024terabox.com/", {
    waitUntil: "networkidle2",
    timeout: 0
  });

  console.log("👉 Please login manually. DO NOT CLOSE THE BROWSER YOURSELF.");
  console.log("⏳ Waiting for login to complete...");

  // Wait until the URL confirms user is logged in
  try {
    await page.waitForFunction(
      () => window.location.href.includes("main") || document.cookie.includes("BDUSS"),
      { timeout: 0 }
    );
  } catch (e) {
    console.log("⚠️ Login detection timeout, BUT we will still try to save cookies...");
  }

  // Save cookies anyway
  const cookies = await page.cookies();
  fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));

  console.log("🎉 cookies.json saved successfully!");
  console.log("📁 Check the file in your folder.");

  // Close browser from script
  await browser.close();
})();