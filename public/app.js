const form = document.getElementById("downloadForm");
const videoUrl = document.getElementById("videoUrl");
const analyzeButton = document.getElementById("analyzeButton");
const clearButton = document.getElementById("clearButton");
const resultBox = document.getElementById("resultBox");
const message = document.getElementById("message");

const resultTitle = document.getElementById("resultTitle");
const resultPlatform = document.getElementById("resultPlatform");
const resultMessage = document.getElementById("resultMessage");
const integrationNote = document.getElementById("integrationNote");

let selectedFormat = null;
let analyzedPlatform = null;

function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
}

function resetFormats() {
    selectedFormat = null;

    document.querySelectorAll(".format-option").forEach(button => {
        button.classList.remove("selected");
        button.disabled = false;
    });
}

clearButton.addEventListener("click", () => {
    videoUrl.value = "";
    resultBox.hidden = true;
    resetFormats();
    showMessage("");
    videoUrl.focus();
});

videoUrl.addEventListener("input", () => {
    resultBox.hidden = true;
    resetFormats();
    showMessage("");
});



async function convertSample(format) {
    const buttons = document.querySelectorAll(".format-option");

    buttons.forEach(button => button.disabled = true);

    integrationNote.textContent =
        "Converting your local test-media/sample.mp4 file.";

    showMessage(`Converting sample video to ${format}...`);

    try {
        const response = await fetch("/api/convert-sample", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ format })
        });

        if (!response.ok) {
            let errorMessage = "Conversion failed.";

            try {
                const data = await response.json();
                errorMessage = data.message || errorMessage;
            } catch {}

            throw new Error(errorMessage);
        }

        const blob = await response.blob();

        if (!blob.size) {
            throw new Error("The converted file is empty.");
        }

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = `media-downloader-sample.${format.toLowerCase()}`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);

        showMessage(`${format} download successful!`);

        integrationNote.textContent =
            `Sample video successfully converted to ${format}.`;

    } catch (error) {
        showMessage(error.message, true);
    } finally {
        buttons.forEach(button => button.disabled = false);
    }
}


document.querySelectorAll(".format-option").forEach(button => {
    button.addEventListener("click", () => {
        selectedFormat = button.dataset.format;

        document.querySelectorAll(".format-option").forEach(item => {
            item.classList.remove("selected");
        });

        button.classList.add("selected");

        convertSample(selectedFormat);
    });
});

form.addEventListener("submit", async event => {
    event.preventDefault();

    const url = videoUrl.value.trim();

    if (!url) {
        showMessage("Please paste a video link.", true);
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing...";
    resultBox.hidden = true;
    resetFormats();
    showMessage("");

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Could not analyze this link.");
        }

        resultTitle.textContent = data.message;
        analyzedPlatform = data.platform;
        resultPlatform.textContent = "Source: " + data.platform;
        resultMessage.textContent = data.note;

        integrationNote.textContent =
            "Choose a format to test conversion using the local sample video.";

        resultBox.hidden = false;
        showMessage("Link analyzed successfully.");

    } catch (error) {
        showMessage(error.message, true);
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = 'Analyze Link <span>→</span>';
    }
});
