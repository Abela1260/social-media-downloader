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

function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
}

function resetFormats() {
    selectedFormat = null;

    document.querySelectorAll(".format-option").forEach(button => {
        button.classList.remove("selected");
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

document.querySelectorAll(".format-option").forEach(button => {
    button.addEventListener("click", () => {
        selectedFormat = button.dataset.format;

        document.querySelectorAll(".format-option").forEach(item => {
            item.classList.remove("selected");
        });

        button.classList.add("selected");

        integrationNote.textContent =
            selectedFormat + " selected. Actual downloading requires an authorized platform integration.";
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
            throw new Error(data.error || "Could not analyze this link.");
        }

        resultTitle.textContent = data.message;
        resultPlatform.textContent = "Source: " + data.platform;
        resultMessage.textContent = data.note;
        integrationNote.textContent =
            "Select MP4 or MP3 to choose your intended output format.";

        resultBox.hidden = false;
        showMessage("Link analyzed successfully.");

    } catch (error) {
        showMessage(error.message, true);
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = 'Analyze Link <span>→</span>';
    }
});
