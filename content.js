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
    let counts = { filled: 0, total: 0 };
    try {
        const strategy = ATSStrategyRegistry.getStrategy(window.location.href, document);
        if (strategy) {
            counts = await strategy.execute(data, resume) || counts;
        }
    } catch (err) { /* silent error for generic strategy */ }

    const meta = extractJobMetadata();
    chrome.runtime.sendMessage({ 
        action: 'log_fill', 
        data: { 
            url: window.location.href, 
            company: meta.company, 
            role: meta.role,
            filled: counts.filled,
            total: counts.total
        } 
    });
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

