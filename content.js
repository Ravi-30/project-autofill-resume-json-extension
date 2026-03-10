// content.js

// content.js

let autoFillState = {
    hasRun: false,
    debouncing: false,
    lastAutoSubmitTime: 0,
    get submissionAttempted() {
        return sessionStorage.getItem('autofill_submission_attempted') === 'true';
    },
    set submissionAttempted(val) {
        sessionStorage.setItem('autofill_submission_attempted', val ? 'true' : 'false');
    }
};

// Listen for messages from popup (Manual fallback or Edits)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fill_form") {
        // console.log("AutoFill: Received manual trigger", request.normalizedData);
        fillForm(request.normalizedData, request.aiEnabled, true);
        sendResponse({ status: "done" });
    } else if (request.action === "apply_edits") {
        // console.log("AutoFill: Received edits from Side Panel", request.edits);
        applyEdits(request.edits);
        sendResponse({ status: "done" });
    } else if (request.action === "auto_submit") {
        // console.log("AutoFill: Received auto_submit manual trigger");
        try {
            const strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
            if (strategy && typeof strategy.autoSubmit === 'function') {
                strategy.autoSubmit();
                sendResponse({ status: "done" });
            } else {
                console.warn("AutoFill: autoSubmit not supported for this strategy");
                sendResponse({ status: "not_supported" });
            }
        } catch (err) {
            console.error("AutoFill: autoSubmit failed:", err);
            sendResponse({ status: "error", error: err.message });
        }
        return true; // Keep channel open for async response
    } else if (request.action === "queue_status_update") {
        // console.log("AutoFill: Received queue status update", request.data);
        if (request.data.status === "running") {
            injectAutoRunOverlay(request.data.currentIndex, request.data.totalJobs);
        } else {
            const existing = document.getElementById('autofill-premium-overlay');
            if (existing) {
                // console.log("AutoFill: Removing existing overlay (Queue stopped)");
                existing.remove();
            }
        }
    } else if (request.action === "get_page_context") {
        try {
            const strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
            if (strategy && typeof strategy.getPageContext === 'function') {
                sendResponse(strategy.getPageContext());
            } else {
                // Global fallback if no strategy or method
                sendResponse({
                    pageTitle: document.title,
                    headerText: document.querySelector('h1')?.innerText || "",
                    url: window.location.href
                });
            }
        } catch (e) {
            sendResponse({});
        }
        return true;
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
    autoFillState.debouncing = true;
    setTimeout(() => {
        if (!chrome.runtime?.id) return; // Prevent "Extension context invalidated"

        try {
            chrome.storage.local.get(['normalizedData', 'aiEnabled', 'resumeFile', 'autoRunActive', 'currentJobIndex', 'totalJobs'], (result) => {
                if (chrome.runtime.lastError) return;

                // Early overlay injection if queue is active
                if (result.autoRunActive) {
                    injectAutoRunOverlay(result.currentJobIndex, result.totalJobs);
                }

                if (result.normalizedData) {
                    fillForm(result.normalizedData, result.aiEnabled || false, false, result.resumeFile, result.autoRunActive, result.currentJobIndex, result.totalJobs);
                }
            });
        } catch (error) {
            console.debug("AutoFill: Storage get failed (likely context invalidated).", error);
        }

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

// 3. Listen for Mutations (Dynamic Form Rendering / Success Detection)
const observer = new MutationObserver((mutations) => {
    if (!chrome.runtime?.id) {
        observer.disconnect();
        return;
    }

    let shouldTrigger = false;

    // If auto-run is active, be much more aggressive about checking for success
    try {
        chrome.storage.local.get(['autoRunActive'], (result) => {
            if (chrome.runtime.lastError) return;

            if (result.autoRunActive) {
                // Any structural change might be the "Thank You" message appearing
                attemptAutoFill();
                return;
            }

            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
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
    } catch (e) {
        // Context likely invalidated, ignore
    }
});

// Start observing
observer.observe(document.body, { childList: true, subtree: true });

// 4. Success Polling (Fail-safe for AJAX transitions)
const successPollInterval = setInterval(() => {
    if (!chrome.runtime?.id) {
        clearInterval(successPollInterval);
        return;
    }

    try {
        chrome.storage.local.get(['autoRunActive'], (result) => {
            if (chrome.runtime.lastError) return;
            if (result.autoRunActive && checkSuccessPage()) {
                attemptAutoFill();
            }
        });
    } catch (e) {
        // Context invalidated, ignore
    }
}, 5000);

// 4. Global Click Listener to track manual submissions
document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('button, input[type="submit"], input[type="button"], a.btn');
    if (!btn) return;

    const text = (btn.innerText || btn.value || "").toLowerCase();
    const isFinalSubmit = text.includes('submit') || text.includes('finish') || text.includes('apply');
    const isNextStep = text.includes('next') || text.includes('continue');

    if (isFinalSubmit || isNextStep) {
        // console.log("AutoFill: Manual navigation/submission button clicked, recording URL");
        if (isFinalSubmit) autoFillState.submissionAttempted = true;

        if (chrome.runtime?.id) {
            try {
                chrome.storage.local.set({ lastSubmittedUrl: window.location.href });
            } catch (e) { }
        }
    }
}, true);

function checkSuccessPage() {
    // 1. Stricter Keywords (require more distinct success phrases)
    const successKeywords = [
        "thank you for applying",
        "application received",
        "application submitted",
        "successfully submitted",
        "received your application",
        "your application was sent",
        "application success",
        "has been submitted"
    ];

    const bodyText = document.body.innerText.toLowerCase();
    const isSuccessText = successKeywords.some(keyword => bodyText.includes(keyword));

    // 2. URL Patterns
    const currentUrl = window.location.href.toLowerCase();
    const isSuccessUrl = currentUrl.includes('confirmation') ||
        currentUrl.includes('thank-you') ||
        currentUrl.includes('thank_you') ||
        currentUrl.includes('application_submitted') ||
        currentUrl.includes('applied-successfully');

    // 3. Counter-indicators: If there's a significant form present, it's likely NOT a success page
    // We only count inputs that are NOT in footers or hidden
    const formInputs = document.querySelectorAll('main input:not([type="hidden"]), #content input:not([type="hidden"]), .application input:not([type="hidden"]), input:not([type="hidden"]):not(footer input)');

    // If we have extremely strong success text, we can be more lenient with the form check
    const hasVeryStrongText = bodyText.includes("thank you for applying") || bodyText.includes("successfully submitted");
    const maxAllowedInputs = hasVeryStrongText ? 10 : 3;

    return (isSuccessText || isSuccessUrl) && formInputs.length <= maxAllowedInputs;
}

async function fillForm(normalizedData, aiEnabled, isManualTrigger = false, resumeFile = null, autoRunActive = false, currentJobIndex = 0, totalJobs = 0) {
    if (isManualTrigger) {
        showToast("AutoFill: Initiating Force Fill...", "info");
    }
    // console.log("fillForm called with:", { autoRunActive, currentJobIndex, totalJobs, isManualTrigger });

    // Check for success page first
    if (autoRunActive && checkSuccessPage()) {
        const tabUrl = window.location.href;
        chrome.storage.local.get(['lastSubmittedUrl'], (result) => {
            // 1. Confirmed success: we actually tried to submit on this hostname recently
            const isConfirmedSuccess = autoFillState.submissionAttempted && result.lastSubmittedUrl &&
                tabUrl.includes(new URL(result.lastSubmittedUrl).hostname);

            // 2. Definitive URL success: URL contains confirmation keywords (redirection usually happens)
            const currentUrl = window.location.href.toLowerCase();
            const isDefinitiveSuccessUrl = currentUrl.includes('confirmation') || currentUrl.includes('thank-you') || currentUrl.includes('thank_you') || currentUrl.includes('post_apply');

            // 3. High-Confidence Success Text: No form fields and very strong success phrases
            const bodyText = document.body.innerText.toLowerCase();
            const hasVeryStrongSuccessText = (bodyText.includes("thank you for applying") || bodyText.includes("successfully submitted")) &&
                !document.querySelector('input:not([type="hidden"])');

            if (isConfirmedSuccess || isDefinitiveSuccessUrl || hasVeryStrongSuccessText) {
                // console.log("AutoFill: Success state confirmed (Attempted:", autoFillState.submissionAttempted, "DefinitiveURL:", isDefinitiveSuccessUrl, "StrongText:", hasVeryStrongSuccessText, "). Advancing queue...");
                setTimeout(() => {
                    chrome.runtime.sendMessage({ action: 'next_job' });
                }, 3000);
            } else {
                // console.log("AutoFill: Potential success page detected, but waiting for submission attempt or stronger signal.");
            }
        });
        return;
    }

    // console.log("Detected URL:", window.location.href);

    let strategy;
    try {
        strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
        console.log("AutoFill: Selected strategy:", strategy.constructor.name);
        console.log("AutoFill: Executing strategy...");
        await strategy.execute(normalizedData, aiEnabled, resumeFile);
    } catch (err) {
        console.error("AutoFill: Strategy execution failed:", err);
        // Continue to show overlay and auto-submit even if fill had errors
    }

    // Auto-Apply Execution Loop
    if (autoRunActive) {
        // console.log("✓ Auto-Run is ACTIVE - injecting overlay for job", (currentJobIndex || 0) + 1, "of", totalJobs);
        injectAutoRunOverlay(currentJobIndex, totalJobs);

        /* 
        // DISABLED per user request for manual submission only
        // Wait 5 seconds for a human feel and to let SPA settle
        setTimeout(() => {
            const now = Date.now();
            if (now - autoFillState.lastAutoSubmitTime < 5000) {
                // console.log("AutoFill: Skipping autoSubmit - too soon after last attempt");
                return;
            }

            if (strategy && typeof strategy.autoSubmit === 'function') {
                // console.log("AutoFill: Attempting autoSubmit strategy...");
                autoFillState.lastAutoSubmitTime = Date.now();
                const submitted = strategy.autoSubmit();

                if (submitted) {
                    // Mark that we've attempted a submission on this URL
                    autoFillState.submissionAttempted = true;
                    chrome.storage.local.set({ lastSubmittedUrl: window.location.href });
                }
            } else {
                // console.log("AutoFill: No autoSubmit strategy for this site.");
            }
        }, 5000);
        */
    }
}

function injectAutoRunOverlay(currentIndex, totalJobs) {
    // console.log("AutoFill: Injecting premium overlay - Index:", currentIndex, "Total:", totalJobs);

    const targetDoc = (window.self === window.top) ? document : (function () {
        try { return window.top.document; } catch (_) { return document; }
    })();

    const overlayId = 'autofill-premium-overlay';
    let overlay = targetDoc.getElementById(overlayId);

    if (overlay) {
        // Just update numbers if it already exists
        const countSpan = overlay.querySelector('.job-count-badge');
        if (countSpan) countSpan.textContent = `${(currentIndex || 0) + 1} / ${totalJobs || '?'}`;
        overlay.style.setProperty('display', 'flex', 'important');
        return;
    }

    overlay = targetDoc.createElement('div');
    overlay.id = overlayId;

    // Premium Design: Frosted Glass + Modern Typography
    const style = targetDoc.createElement('style');
    style.textContent = `
        #${overlayId} {
            all: initial;
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            z-index: 2147483647 !important;
            width: 280px !important;
            background: rgba(255, 255, 255, 0.85) !important;
            backdrop-filter: blur(16px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
            border: 1px solid rgba(255, 255, 255, 0.4) !important;
            border-radius: 20px !important;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.3) !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 16px !important;
            box-sizing: border-box !important;
            animation: af-fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
            cursor: default !important;
            user-select: none !important;
        }

        /* Hide annoying reCAPTCHA badge which often appears in the same spot */
        .grecaptcha-badge { 
            visibility: hidden !important; 
            opacity: 0 !important;
            pointer-events: none !important;
        }

        @keyframes af-fade-in {
            from { opacity: 0; transform: translateY(10px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .af-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            margin-bottom: 16px !important;
        }

        .af-logo-title {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            color: #4f46e5 !important;
            font-weight: 700 !important;
            font-size: 15px !important;
        }

        .job-count-badge {
            background: #4f46e5 !important;
            color: white !important;
            padding: 4px 10px !important;
            border-radius: 20px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
        }

        .af-status-row {
            margin-bottom: 20px !important;
        }

        .af-status-label {
            color: #6b7280 !important;
            font-size: 12px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
            margin-bottom: 4px !important;
            display: block !important;
        }

        .af-status-text {
            color: #111827 !important;
            font-size: 14px !important;
            font-weight: 500 !important;
        }

        .af-button-group {
            display: flex !important;
            gap: 12px !important;
        }

        .af-btn {
            flex: 1 !important;
            border: none !important;
            border-radius: 10px !important;
            padding: 10px 16px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
        }

        .af-btn-primary {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
            color: white !important;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3) !important;
        }

        .af-btn-primary:hover {
            transform: translateY(-1px) !important;
            box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4) !important;
        }

        .af-btn-secondary {
            background: #f3f4f6 !important;
            color: #4b5563 !important;
        }

        .af-btn-secondary:hover {
            background: #e5e7eb !important;
        }

        /* Drag Handle Style */
        .af-drag-handle {
            cursor: grab !important;
        }
        .af-drag-handle:active {
            cursor: grabbing !important;
        }
    `;
    targetDoc.head.appendChild(style);

    overlay.innerHTML = `
        <div class="af-header af-drag-handle">
            <div class="af-logo-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                </svg>
                AutoFill Queue
            </div>
            <span class="job-count-badge">${(currentIndex || 0) + 1} / ${totalJobs || '?'}</span>
        </div>
        
        <div class="af-status-row">
            <span class="af-status-label">Current Progress</span>
            <div class="af-status-text">Processing Application...</div>
        </div>

        <div class="af-button-group">
            <button id="af-next-job" class="af-btn af-btn-primary">
                <span>Next Job</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"></path>
                </svg>
            </button>
            <button id="af-stop-queue" class="af-btn af-btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                </svg>
                Stop
            </button>
        </div>
    `;

    const target = targetDoc.body || targetDoc.documentElement;
    target.appendChild(overlay);

    // Draggable Functionality
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragHandle = overlay.querySelector('.af-drag-handle');

    dragHandle.addEventListener('mousedown', dragStart);
    targetDoc.addEventListener('mousemove', drag);
    targetDoc.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        if (e.target === dragHandle || dragHandle.contains(e.target)) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            setTranslate(currentX, currentY, overlay);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    // Button Actions
    overlay.querySelector('#af-next-job').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ action: 'next_job' });
    });

    overlay.querySelector('#af-stop-queue').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ action: 'stop_queue' });
        overlay.remove();
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `af-toast af-toast-${type}`;
    toast.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
        .af-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            z-index: 2147483647;
            font-family: sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: af-toast-in 0.3s ease-out;
        }
        @keyframes af-toast-in {
            from { bottom: 0; opacity: 0; }
            to { bottom: 24px; opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
