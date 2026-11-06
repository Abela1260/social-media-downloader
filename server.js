const dns = require("dns").promises;
const net = require("net");
const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const PYTHON_PATH =
    "C:\\Users\\aa\\AppData\\Local\\Python\\pythoncore-3.15-64\\python.exe";

const app = express();
const PORT = 3000;

const FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe";
const SAMPLE_VIDEO = path.join(__dirname, "test-media", "sample.mp4");

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

    if (["youtube.com", "www.youtube.com", "youtu.be",
         "m.youtube.com", "music.youtube.com"].includes(host)) {
        platform = "YouTube";
    } else if (["tiktok.com", "www.tiktok.com",
                "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
        platform = "TikTok";
    } else if (["instagram.com", "www.instagram.com",
                "instagr.am"].includes(host)) {
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
        note: "Platform recognition only. Actual media access requires an authorized integration."
    });
});

// Convert the local sample video and download the result.
// This is a demo endpoint, not a social-media URL downloader.
app.post("/api/convert-sample", (req, res) => {
    const format = String(req.body?.format || "").toUpperCase();

    if (!["MP4", "MP3"].includes(format)) {
        return res.status(400).json({
            success: false,
            message: "Choose MP4 or MP3."
        });
    }

    if (!fs.existsSync(SAMPLE_VIDEO)) {
        return res.status(404).json({
            success: false,
            message: "test-media/sample.mp4 was not found."
        });
    }

    const outputExtension = format.toLowerCase();
    const outputPath = path.join(
        os.tmpdir(),
        `media-downloader-${crypto.randomUUID()}.${outputExtension}`
    );

    let args;

    if (format === "MP3") {
        args = [
            "-y",
            "-i", SAMPLE_VIDEO,
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", "192k",
            outputPath
        ];
    } else {
        args = [
            "-y",
            "-i", SAMPLE_VIDEO,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            outputPath
        ];
    }

    let ffmpeg;

    try {
        ffmpeg = spawn(FFMPEG_PATH, args);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Could not start FFmpeg."
        });
    }

    let errorOutput = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
        timedOut = true;
        ffmpeg.kill();
    }, 120000);

    ffmpeg.stderr.on("data", data => {
        errorOutput += data.toString();
    });

    ffmpeg.on("error", error => {
        clearTimeout(timeout);
        console.error(error);
        fs.promises.unlink(outputPath).catch(() => {});

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Could not start FFmpeg."
            });
        }
    });

    ffmpeg.on("close", code => {
        clearTimeout(timeout);

        if (timedOut) {
            fs.promises.unlink(outputPath).catch(() => {});
            if (!res.headersSent) {
                res.status(504).json({
                    success: false,
                    message: "Conversion timed out."
                });
            }
            return;
        }

        if (code !== 0 || !fs.existsSync(outputPath)) {
            console.error(errorOutput);
            fs.promises.unlink(outputPath).catch(() => {});

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: "Conversion failed. Check that the sample video contains the required media."
                });
            }
            return;
        }

        const downloadName = `media-downloader-sample.${outputExtension}`;

        res.download(outputPath, downloadName, error => {
            fs.promises.unlink(outputPath).catch(() => {});

            if (error && !res.headersSent) {
                console.error(error);
                res.status(500).end("Download failed.");
            }
        });
    });
});

const MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024; // 100 MB

function isPrivateAddress(address) {
    const ip = address.toLowerCase();

    if (net.isIP(ip) === 4) {
        const parts = ip.split(".").map(Number);
        const [a, b] = parts;

        return (
            a === 0 || a === 10 || a === 127 ||
            a >= 224 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168)
        );
    }

    if (net.isIP(ip) === 6) {
        return (
            ip === "::1" ||
            ip === "::" ||
            ip.startsWith("fc") ||
            ip.startsWith("fd") ||
            ip.startsWith("fe80:") ||
            ip.startsWith("::ffff:127.") ||
            ip.startsWith("::ffff:10.") ||
            ip.startsWith("::ffff:192.168.")
        );
    }

    return true;
}

async function validatePublicUrl(value) {
    const parsed = new URL(value);

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are allowed.");
    }

    if (parsed.username || parsed.password) {
        throw new Error("URLs containing login credentials are not allowed.");
    }

    const addresses = await dns.lookup(parsed.hostname, {
        all: true,
        verbatim: true
    });

    if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
        throw new Error("This server address is not allowed.");
    }

    return parsed;
}

app.post("/api/download-direct", async (req, res) => {
    const { url, format } = req.body || {};
    const selectedFormat = String(format || "").toUpperCase();

    if (!url || !["MP4", "MP3"].includes(selectedFormat)) {
        return res.status(400).json({
            success: false,
            message: "Provide a media URL and choose MP4 or MP3."
        });
    }

    let inputPath;
    let outputPath;

    try {
        let currentUrl = url;
        let response;

        // Validate every URL, including redirects.
        for (let attempt = 0; attempt < 4; attempt++) {
            await validatePublicUrl(currentUrl);

            response = await fetch(currentUrl, {
                redirect: "manual",
                signal: AbortSignal.timeout(60000)
            });

            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get("location");

                if (!location || attempt === 3) {
                    throw new Error("Too many or invalid redirects.");
                }

                currentUrl = new URL(location, currentUrl).href;
                continue;
            }

            break;
        }

        if (!response || !response.ok) {
            throw new Error("The media server could not provide the file.");
        }

        const contentType = response.headers.get("content-type") || "";
        const allowedTypes = [
            "video/mp4", "video/webm", "video/quicktime",
            "audio/mpeg", "audio/mp4", "audio/wav",
            "audio/ogg", "application/octet-stream"
        ];

        if (!allowedTypes.some(type => contentType.includes(type))) {
            throw new Error("The URL does not appear to contain a supported media file.");
        }

        const length = Number(response.headers.get("content-length") || 0);

        if (length > MAX_DOWNLOAD_SIZE) {
            throw new Error("The file exceeds the 100 MB download limit.");
        }

        if (!response.body) {
            throw new Error("The media server returned an empty response.");
        }

        inputPath = path.join(
            os.tmpdir(),
            `media-input-${crypto.randomUUID()}`
        );

        outputPath = path.join(
            os.tmpdir(),
            `media-output-${crypto.randomUUID()}.${selectedFormat.toLowerCase()}`
        );

        const { Readable, Transform } = require("stream");
        const { pipeline } = require("stream/promises");

        let downloaded = 0;

        const sizeLimiter = new Transform({
            transform(chunk, encoding, callback) {
                downloaded += chunk.length;

                if (downloaded > MAX_DOWNLOAD_SIZE) {
                    callback(new Error("File exceeds the 100 MB limit."));
                } else {
                    callback(null, chunk);
                }
            }
        });

        await pipeline(
            Readable.fromWeb(response.body),
            sizeLimiter,
            fs.createWriteStream(inputPath)
        );

        const args = selectedFormat === "MP3"
            ? ["-y", "-i", inputPath, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", outputPath]
            : ["-y", "-i", inputPath, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", outputPath];

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(FFMPEG_PATH, args);

            let errorOutput = "";

            ffmpeg.stderr.on("data", data => {
                errorOutput += data.toString();
            });

            ffmpeg.on("error", reject);

            ffmpeg.on("close", code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error("Media conversion failed. " + errorOutput.slice(-500)));
                }
            });
        });

        res.download(
            outputPath,
            `media-download.${selectedFormat.toLowerCase()}`,
            error => {
                fs.promises.unlink(inputPath).catch(() => {});
                fs.promises.unlink(outputPath).catch(() => {});

                if (error) console.error("Download response error:", error.message);
            }
        );

    } catch (error) {
        if (inputPath) fs.promises.unlink(inputPath).catch(() => {});
        if (outputPath) fs.promises.unlink(outputPath).catch(() => {});

        console.error("Direct download error:", error.message);

        if (!res.headersSent) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
});

app.get("/api/yt-dlp-version", (req, res) => {
    const process = spawn(PYTHON_PATH, ["-m", "yt_dlp", "--version"]);

    let output = "";

    process.stdout.on("data", data => {
        output += data.toString();
    });

    process.on("close", code => {
        if (code === 0) {
            res.json({
                success: true,
                version: output.trim()
            });
        } else {
            res.status(500).json({
                success: false,
                message: "yt-dlp could not start."
            });
        }
    });
});

app.post("/api/video-info", async (req, res) => {
    const { url } = req.body || {};

    if (!url) {
        return res.status(400).json({
            success: false,
            message: "Please provide a video URL."
        });
    }

    let parsedUrl;

    try {
        parsedUrl = await validatePublicUrl(url);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    const host = parsedUrl.hostname.toLowerCase();

    const allowedDomains = [
        "youtube.com",
        "youtu.be",
        "tiktok.com",
        "instagram.com",
        "instagr.am"
    ];

    const supportedPlatform = allowedDomains.some(
        domain => host === domain || host.endsWith("." + domain)
    );

    const directMedia = /\.(mp4|webm|mov|m4v|mp3|m4a|wav|ogg)$/i
        .test(parsedUrl.pathname);

    if (!supportedPlatform && !directMedia) {
        return res.status(400).json({
            success: false,
            message: "This video source is not supported."
        });
    }

    const child = spawn(PYTHON_PATH, [
        "-m",
        "yt_dlp",
        "--dump-single-json",
        "--no-warnings",
        "--no-playlist",
        "--skip-download",
        "--socket-timeout",
        "20",
        parsedUrl.href
    ], { windowsHide: true });

    let output = "";
    let errorOutput = "";
    let timedOut = false;
    let tooLarge = false;

    const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
    }, 60000);

    child.stdout.on("data", data => {
        output += data.toString();

        if (output.length > 5 * 1024 * 1024) {
            tooLarge = true;
            child.kill();
        }
    });

    child.stderr.on("data", data => {
        errorOutput += data.toString();
        errorOutput = errorOutput.slice(-3000);
    });

    child.on("error", error => {
        clearTimeout(timeout);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Could not start yt-dlp."
            });
        }
    });

    child.on("close", code => {
        clearTimeout(timeout);

        if (timedOut || tooLarge) {
            return res.status(504).json({
                success: false,
                message: timedOut
                    ? "Video analysis timed out."
                    : "Video information is too large."
            });
        }

        if (code !== 0) {
            return res.status(422).json({
                success: false,
                message: errorOutput.slice(-500) ||
                    "Could not extract video information."
            });
        }

        try {
            const info = JSON.parse(output);

            const formats = (info.formats || [])
                .filter(format => format.vcodec !== "none")
                .map(format => ({
                    format_id: format.format_id,
                    ext: format.ext,
                    resolution: format.resolution,
                    height: format.height,
                    fps: format.fps
                }))
                .slice(0, 30);

            res.json({
                success: true,
                title: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration,
                uploader: info.uploader,
                platform: info.extractor,
                formats
            });

        } catch {
            res.status(500).json({
                success: false,
                message: "Could not read video information."
            });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Media Downloader running at http://localhost:${PORT}`);
});

