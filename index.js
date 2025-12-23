import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {
  res.json({ status: "backend running" });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
