const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

function detectPlatform(hostname) {
    const host = hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtube.com" || host === "youtu.be" ||
        host === "m.youtube.com" || host === "music.youtube.com") {
        return "YouTube";
    }

    if (host === "tiktok.com" || host === "vm.tiktok.com" ||
        host === "vt.tiktok.com") {
        return "TikTok";
    }

    if (host === "instagram.com" || host === "instagr.am") {
        return "Instagram";
    }

    return null;
}

app.post("/api/analyze", (req, res) => {
    const { url } = req.body || {};

    if (typeof url !== "string" || !url.trim()) {
        return res.status(400).json({
            error: "Please paste a video URL."
        });
    }

    let parsed;

    try {
        parsed = new URL(url.trim());
    } catch {
        return res.status(400).json({
            error: "Please enter a valid URL."
        });
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return res.status(400).json({
            error: "Only HTTP and HTTPS links are accepted."
        });
    }

    const platform = detectPlatform(parsed.hostname);

    if (!platform) {
        return res.status(400).json({
            error: "This source is not supported. Try YouTube, TikTok or Instagram."
        });
    }

    res.json({
        success: true,
        platform,
        message: platform + " link recognized.",
        status: "integration_required",
        formats: ["MP4", "MP3"],
        note: "A permitted platform integration is required before this media can be downloaded."
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log("-----------------------------------");
    console.log("MEDIA DOWNLOADER IS RUNNING");
    console.log("http://localhost:" + PORT);
    console.log("-----------------------------------");
});
