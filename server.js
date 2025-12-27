import express from "express";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 10000;

// Load saved login cookies (generated from login-local.js)
const COOKIES = fs.existsSync("cookies.json") ? JSON.parse(fs.readFileSync("cookies.json")) : [];
const LOGIN_COOKIE = COOKIES.map(c => `${c.name}=${c.value}`).join("; ");

function normalize(url) {
  if (!url) return null;
  url = url.trim();

  // extract share ID from any terabox mirror
  const match = url.match(/\/s\/([A-Za-z0-9\-_]+)/);
  return match ? match[1] : null;
}

async function getTeraboxMeta(surl) {
  const metaURL = `https://dm.1024tera.com/sharing/link?surl=${surl}&clearCache=1`;

  const response = await fetch(metaURL, {
    headers: {
      "cookie": LOGIN_COOKIE,
      "user-agent": "Mozilla/5.0",
      "referer": "https://1024terabox.com/"
    }
  });

  const text = await response.text();

  // Extract internal JSON (this is how teradownloader does it)
  const jsonMatch = text.match(/window\.preloadData\s?=\s?({.*});/);
  if (!jsonMatch) throw new Error("No internal metadata detected");

  const json = JSON.parse(jsonMatch[1]);
  return json;
}

async function getDirectLink(surl) {
  const url = `https://dm.1024tera.com/sharing/link?surl=${surl}&clearCache=1`;
  const r = await fetch(url, {
    headers: {
      "cookie": LOGIN_COOKIE,
      "user-agent": "Mozilla/5.0",
      "referer": "https://1024terabox.com/"
    }
  });
  const text = await r.text();

  const dlMatch = text.match(/https:\/\/data\.terabox\.app\/file[^"]+/);
  return dlMatch ? dlMatch[0] : null;
}

// ---------------- API ENDPOINT ----------------
app.get("/api", async (req, res) => {
  const input = req.query.url;
  const surl = normalize(input);

  if (!surl) return res.json({ error: "❌ Invalid Terabox share link" });

  try {
    // 1. fetch metadata
    const data = await getTeraboxMeta(surl);

    const file = data.file_list.file_list[0];
    const name = file.server_filename;
    const size = file.size;
    const fs_id = file.fs_id;

    // 2. direct link generation
    const direct = await getDirectLink(surl);
    if (!direct) return res.json({ error: "⚠️ No direct link generated. Cookies may be expired." });

    // 3. streaming URL (video player link)
    const stream = `https://v.1024terabox.com/play/${fs_id}`;

    // 4. Final output
    res.json({
      status: "🟢 SUCCESS",
      surl,
      name,
      size,
      streaming: stream,
      direct_download: direct,
      raw_api_used: "dm.1024tera.com + data.terabox.app"
    });

  } catch (e) {
    res.json({ error: "❌ Failed", reason: e.message });
  }
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => console.log("🚀 READY: http://localhost:" + PORT));
