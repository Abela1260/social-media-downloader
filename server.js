
const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = 3000;

const FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe";

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Analyze supported social media links
app.post("/api/analyze", (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      success: false,
      message: "Please enter a URL."
    });
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid URL."
    });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({
      success: false,
      message: "Only HTTP and HTTPS links are supported."
    });
  }

  const host = parsedUrl.hostname.toLowerCase();
  let platform = null;

  if (
    ["youtube.com", "www.youtube.com", "youtu.be",
     "m.youtube.com", "music.youtube.com"].includes(host)
  ) {
    platform = "YouTube";
  } else if (
    ["tiktok.com", "www.tiktok.com", "vm.tiktok.com",
     "vt.tiktok.com"].includes(host)
  ) {
    platform = "TikTok";
  } else if (
    ["instagram.com", "www.instagram.com", "instagr.am"].includes(host)
  ) {
    platform = "Instagram";
  }

  if (!platform) {
    return res.status(400).json({
      success: false,
      message: "This platform is not supported."
    });
  }

  res.json({
    success: true,
    platform,
    formats: ["MP4", "MP3"],
    message: `${platform} link recognized.`,
    note: "Actual downloading requires an authorized media integration."
  });
});

// Test MP4-to-MP3 conversion using our sample video
app.get("/api/test-convert", (req, res) => {
  const input = path.join(__dirname, "test-media", "sample.mp4");
  const output = path.join(__dirname, "test-media", "converted.mp3");

  if (!fs.existsSync(input)) {
    return res.status(404).send(
      "Sample video not found. Create test-media/sample.mp4 first."
    );
  }

  const ffmpeg = spawn(FFMPEG_PATH, [
    "-y",
    "-i", input,
    "-vn",
    "-codec:a", "libmp3lame",
    "-b:a", "192k",
    output
  ]);

  let errorOutput = "";

  ffmpeg.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  ffmpeg.on("error", (error) => {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).send("Could not start FFmpeg.");
    }
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      console.error(errorOutput);
      if (!res.headersSent) {
        res.status(500).send("MP3 conversion failed.");
      }
      return;
    }

    res.download(output, "converted.mp3");
  });
});

app.listen(PORT, () => {
  console.log(`Media Downloader running at http://localhost:${PORT}`);
});
