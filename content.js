// content.js

// content.js

let autoFillState = {
    hasRun: false,
    debouncing: false
};

// Listen for messages from popup (Manual fallback or Edits)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fill_form") {
        console.log("AutoFill: Received manual trigger", request.normalizedData);
        fillForm(request.normalizedData, request.aiEnabled, true);
        sendResponse({ status: "done" });
    } else if (request.action === "apply_edits") {
        console.log("AutoFill: Received edits from Side Panel", request.edits);
        applyEdits(request.edits);
        sendResponse({ status: "done" });
    }
});

function applyEdits(edits) {
    edits.forEach(edit => {
        // Attempt to find the input by ID, then name
        let input = document.getElementById(edit.id);
        if (!input) {
            input = document.querySelector(`[name="${edit.id}"]`);
        }

        if (input) {
            // Need a way to call setInputValue which is inside the strategy. 
            // For simplicity, we just replicate the dispatch logic here since it's a direct override.
            input.value = edit.value;

            ['input', 'change', 'blur'].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                input.dispatchEvent(event);
            });

            // Flash green to confirm edit application
            const originalBg = input.style.backgroundColor;
            const originalBorder = input.style.border;
            input.style.backgroundColor = "#dcfce7";
            input.style.border = "2px solid #22c55e";

            setTimeout(() => {
                input.style.backgroundColor = originalBg;
                input.style.border = originalBorder;
            }, 3000);
        }
    });
}

/**
 * Triggers the fill routine if it hasn't run recently for the current form state.
 */
function attemptAutoFill() {
    if (autoFillState.debouncing) return;

    autoFillState.debouncing = true;
    setTimeout(() => {
        chrome.storage.local.get(['normalizedData', 'aiEnabled', 'resumeFile'], (result) => {
            if (result.normalizedData) {
                console.log("AutoFill: Automatically executing using cached normalized data");
                fillForm(result.normalizedData, result.aiEnabled || false, false, result.resumeFile);
            }
        });
        autoFillState.debouncing = false;
    }, 1500); // 1.5s debounce to let the SPA settle
}

// 1. Listen for DOM Ready
window.addEventListener('load', attemptAutoFill);

// 2. Listen for SPA Route Changes
// Overriding pushState/replaceState since popstate doesn't always catch internal route changes
const originalPushState = history.pushState;
history.pushState = function (...args) {
    originalPushState.apply(this, args);
    attemptAutoFill();
};
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    attemptAutoFill();
};
window.addEventListener('popstate', attemptAutoFill);

// 3. Listen for Mutations (Dynamic Form Rendering)
const observer = new MutationObserver((mutations) => {
    let shouldTrigger = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            // Check if added nodes are form elements
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA' || node.querySelector('input, select, textarea')) {
                        shouldTrigger = true;
                    }
                }
            });
        }
    }
    if (shouldTrigger) {
        attemptAutoFill();
    }
});

// Start observing the document body for injected form elements
observer.observe(document.body, { childList: true, subtree: true });

function fillForm(normalizedData, aiEnabled, isManualTrigger = false, resumeFile = null) {
    console.log("Detected URL:", window.location.href);

    const strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
    strategy.execute(normalizedData, aiEnabled, resumeFile);
}
