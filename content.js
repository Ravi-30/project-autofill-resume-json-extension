// content.js

let autoFillState = {
    hasRun: false,
    debouncing: false,

    get submissionAttempted() {
        return sessionStorage.getItem('autofill_submission_attempted') === 'true';
    },
    set submissionAttempted(val) {
        sessionStorage.setItem('autofill_submission_attempted', val ? 'true' : 'false');
    }
};

// Mark any field the USER physically edits so autofill never overwrites their corrections.
document.addEventListener('input', (e) => {
    if (e.isTrusted && e.target.matches('input, textarea, select')) {
        e.target.dataset.afUserLocked = 'true';
    }
}, true);

// Listen for messages from popup (Manual fallback or Edits)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fill_form") {
        injectAutoRunOverlay();
        fillForm(request.normalizedData, true, request.resumeFile);
        sendResponse({ status: "done" });
    } else if (request.action === "get_page_context") {
        try {
            const strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
            if (strategy && typeof strategy.getPageContext === 'function') {
                sendResponse(strategy.getPageContext());
            } else {
                sendResponse({
                    pageTitle: document.title,
                    headerText: document.querySelector('h1')?.innerText || "",
                    url: window.location.href
                });
            }
        } catch (e) { sendResponse({}); }
        return true;
    }
});


function attemptAutoFill(force = false) {
    if (autoFillState.debouncing && !force) return;
    autoFillState.debouncing = true;
    setTimeout(() => {
        if (!chrome.runtime?.id) return;
        
        // Request current side panel status for this window from background
        chrome.runtime.sendMessage({ action: 'check_sidepanel_status' }, (response) => {
            if (chrome.runtime.lastError) return;
            const sidePanelOpenInWindow = response?.isOpen || false;

            chrome.storage.local.get(['normalizedData', 'resumeFile', 'savedProfiles', 'activeProfileName', 'resumeData'], (result) => {
                if (chrome.runtime.lastError) return;

                // Only proceed if side panel is open in this window (or it's a forced fill)
                if (!sidePanelOpenInWindow && !force) {
                    const existing = document.getElementById('autofill-premium-overlay');
                    if (existing) existing.remove();
                    autoFillState.debouncing = false;
                    return;
                }

                // Show overlay and auto-fill when sidepanel is open or manually triggered
                if ((sidePanelOpenInWindow || force) && result.normalizedData) {
                    injectAutoRunOverlay();
                    fillForm(result.normalizedData, false, result.resumeFile);
                }
            });
        });
        autoFillState.debouncing = false;
    }, force ? 0 : 1500);
}

function isJobPage() {
    const url = window.location.href.toLowerCase();
    const jobKeywords = [
        'job', 'apply', 'career', 'hiring',
        'lever.co', 'greenhouse.io', 'workday', 'ashbyhq', 'bamboohr', 'smartrecruiters',
        'icims', 'taleo', 'brassring', 'successfactors', 'oraclecloud', 'indeed.com',
        'linkedin.com/jobs', 'recruitee', 'personio', 'teamtailor', 'workable'
    ];

    // Check URL
    const matchedUrl = jobKeywords.find(k => url.includes(k));
    if (matchedUrl) return true;

    // Check for common form fields that indicate an application
    const jobFieldIndicators = [
        'resume', 'cv', 'cover_letter', 'linkedin_profile', 'phone_number',
        'years_of_experience', 'work_authorization', 'sponsorship'
    ];
    const inputs = Array.from(document.querySelectorAll('input, label')).map(e => (e.name || e.id || e.innerText || "").toLowerCase());
    const matchedField = jobFieldIndicators.find(k => inputs.some(i => i.includes(k)));
    if (matchedField) return true;

    return false;
}

// 1. Initial Triggers
window.addEventListener('load', attemptAutoFill);

// 2. SPA Route Changes
const originalPushState = history.pushState;
history.pushState = function (...args) { originalPushState.apply(this, args); attemptAutoFill(); };
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) { originalReplaceState.apply(this, args); attemptAutoFill(); };
window.addEventListener('popstate', attemptAutoFill);

// 3. Mutations
const observer = new MutationObserver((mutations) => {
    if (!chrome.runtime?.id) { observer.disconnect(); return; }
    const trigger = mutations.some(m => Array.from(m.addedNodes).some(n => n.nodeType === Node.ELEMENT_NODE && (n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'TEXTAREA' || n.querySelector('input, select, textarea'))));
    if (trigger) attemptAutoFill();
});
observer.observe(document.body, { childList: true, subtree: true });

// 4. Storage Changes: Only re-trigger if autoRun status changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.activeProfileName) {
        attemptAutoFill();
    }
});

// 5. Manual Submission Tracking
document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('button, input[type="submit"], input[type="button"], a.btn');
    if (!btn) return;
    const txt = (btn.innerText || btn.value || "").toLowerCase();
    if (txt.includes('submit') || txt.includes('finish') || txt.includes('apply')) {
        autoFillState.submissionAttempted = true;
        if (chrome.runtime?.id) {
            chrome.storage.local.set({ lastSubmittedUrl: window.location.href });
            chrome.runtime.sendMessage({ action: 'log_submission', url: window.location.href });
        }
    }
}, true);

function checkSuccessPage() {
    const keywords = ["thank you for applying", "application received", "application submitted", "successfully submitted"];
    const bodyText = document.body.innerText.toLowerCase();
    const isSuccessText = keywords.some(k => bodyText.includes(k));
    const isUrl = window.location.href.toLowerCase().match(/confirmation|thank-you|thank_you/);
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not(footer input)');
    return (isSuccessText || isUrl) && inputs.length <= 5;
}

async function fillForm(data, manual = false, resume = null) {
    try {
        const strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
        if (strategy) await strategy.execute(data, resume);
    } catch (err) { /* silent error for generic strategy */ }

    injectAutoRunOverlay();
    const meta = extractJobMetadata();
    chrome.runtime.sendMessage({ action: 'log_fill', data: { url: window.location.href, company: meta.company, role: meta.role } });
}

function injectAutoRunOverlay() {
    if (window.self !== window.top) return; // Only inject in top window
    const doc = document;
    const id = 'autofill-premium-overlay';
    let el = doc.getElementById(id);
    if (el) {
        setupOverlayListeners(el);
        return;
    }

    el = doc.createElement('div');
    el.id = id;
    const style = doc.createElement('style');
    style.textContent = `
        #${id} {
            all: initial; position: fixed !important; bottom: 24px !important; right: 24px !important; z-index: 2147483647 !important;
            width: 280px !important; height: auto !important; max-height: 90vh !important;
            background: rgba(255, 255, 255, 0.65) !important; backdrop-filter: blur(12px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(12px) saturate(180%) !important; border: 1px solid rgba(255, 255, 255, 0.3) !important;
            border-radius: 20px !important; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15) !important;
            font-family: -apple-system, sans-serif !important; display: flex !important; flex-direction: column !important; padding: 16px !important;
            box-sizing: border-box !important; user-select: none !important;
        }
        .af-h { display: flex !important; justify-content: space-between !important; margin-bottom: 12px !important; font-weight: 700 !important; color: #4f46e5 !important; font-size: 15px !important; cursor: move !important; }
        .af-btns { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
        .af-b { border: none !important; border-radius: 10px !important; padding: 10px !important; font-size: 12px !important; font-weight: 600 !important; cursor: pointer !important; transition: 0.2s !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 4px !important; }
        .af-fill { background: linear-gradient(135deg, #059669, #10b981) !important; color: white !important; }
        .af-stop { background: linear-gradient(135deg, #ef4444, #f87171) !important; color: white !important; }
    `;
    doc.head.appendChild(style);

    // Build Header
    const header = doc.createElement('div');
    header.className = 'af-h';
    const titleSpan = doc.createElement('span');
    titleSpan.textContent = 'AutoFill';
    header.append(titleSpan);

    // Build Buttons
    const btnContainer = doc.createElement('div');
    btnContainer.className = 'af-btns';

    const fillBtn = doc.createElement('button');
    fillBtn.id = 'af-fill-now';
    fillBtn.className = 'af-b af-fill';
    fillBtn.textContent = 'Fill';

    const stopBtn = doc.createElement('button');
    stopBtn.id = 'af-stop-now';
    stopBtn.className = 'af-b af-stop';
    stopBtn.textContent = 'Close';

    btnContainer.append(fillBtn, stopBtn);
    el.append(header, btnContainer);

    doc.body.appendChild(el);

    // Load saved position
    chrome.storage.local.get(['overlayPos'], (res) => {
        if (res.overlayPos) {
            el.style.setProperty('bottom', 'auto', 'important');
            el.style.setProperty('right', 'auto', 'important');
            el.style.setProperty('top', res.overlayPos.top + 'px', 'important');
            el.style.setProperty('left', res.overlayPos.left + 'px', 'important');
        }
    });

    // Make Draggable
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    header.onmousedown = (e) => {
        isDragging = true;
        const rect = el.getBoundingClientRect();
        offset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        e.preventDefault();
    };

    doc.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const x = e.clientX - offset.x;
        const y = e.clientY - offset.y;
        el.style.setProperty('bottom', 'auto', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('left', x + 'px', 'important');
        el.style.setProperty('top', y + 'px', 'important');
    });

    doc.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            const rect = el.getBoundingClientRect();
            chrome.storage.local.set({ overlayPos: { top: rect.top, left: rect.left } });
        }
    });

    setupOverlayListeners(el);
}

function setupOverlayListeners(el) {
    const doc = document;
    el.querySelector('#af-fill-now').onclick = () => {
        doc.querySelectorAll('[data-af-user-locked]').forEach(e => delete e.dataset.afUserLocked);
        attemptAutoFill(true);
    };
    el.querySelector('#af-stop-now').onclick = () => {
        el.remove();
    };
}

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed; top:20px; right:20px; z-index:2147483647; background:${type === 'error' ? '#ef4444' : 'rgba(0,0,0,0.8)'}; color:white; padding:10px 20px; border-radius:12px; font-family:sans-serif; font-size:13px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
}

function extractJobMetadata() {
    let company = "", role = "";
    const gC = document.querySelector('.company-name'), gR = document.querySelector('.app-title');
    if (gC) company = gC.innerText.trim(); if (gR) role = gR.innerText.trim();
    const lR = document.querySelector('.posting-header h2'), lC = document.querySelector('.posting-header .company-logo img')?.alt;
    if (lR) role = lR.innerText.trim(); if (lC) company = lC.replace(" logo", "").trim();
    if (!company || !role) {
        const m = document.title.match(/(.+) (at|\||-) (.+)/i);
        if (m) { role = m[1].trim(); company = m[3].trim(); } else role = document.title;
    }
    return { company: company.substring(0, 50) || "Company", role: role.substring(0, 70) || "Job" };
}

function extractJobDescription() {
    const ss = [
        '.job-description', '#job-description', '.description',
        '[class*="jobDescription"]', '[id*="jobDescription"]',
        '.posting-description', '.job-info', 'main', 'article',
        '#main-content', '.main-content'
    ];
    for (const s of ss) {
        const e = document.querySelector(s);
        if (e && e.innerText.trim().length > 300) {
            // Remove scripts, styles and other junk from innerText if possible
            const clone = e.cloneNode(true);
            clone.querySelectorAll('script, style, nav, footer, header').forEach(n => n.remove());
            const text = clone.innerText.trim();
            if (text.length > 300) return text.substring(0, 5000);
        }
    }
    // Fallback to body but try to find the largest text container
    return document.body.innerText.substring(0, 5000);
}

