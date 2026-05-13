document.addEventListener('DOMContentLoaded', () => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    const port = chrome.runtime.connect({ name: "sidepanel" });
    chrome.windows.getCurrent((win) => {
        if (win && win.id) port.postMessage({ action: 'register_window', windowId: win.id });
    });

    // Elements
    const resumeInput = document.getElementById('resumeInput');
    const fillFormBtn = document.getElementById('fillFormBtn');
    const deleteProfileBtn = document.getElementById('deleteProfileBtn');
    const editDataBtn = document.getElementById('editDataBtn');
    const viewDataBtn = document.getElementById('viewDataBtn');
    const resumePreview = document.getElementById('resumePreview');
    const resumeContent = document.getElementById('resumeContent');
    const validateJsonBtn = document.getElementById('validateJsonBtn');
    const validatePdfBtn = document.getElementById('validatePdfBtn');
    const uploadPdfBtn = document.getElementById('uploadPdfBtn');
    const resumeFileInput = document.getElementById('resumeFileInput');
    const pdfStatusText = document.getElementById('pdfStatusText');
    const statusDiv = document.getElementById('status');
    
    const uploadView = document.getElementById('uploadView');
    const activeView = document.getElementById('activeView');
    const setupSuccess = document.getElementById('setupSuccess');
    
    const progressSection = document.getElementById('progressSection');
    const progressCount = document.getElementById('progressCount');
    const progressBar = document.getElementById('progressBar');
    
    const editSection = document.getElementById('editSection');
    const resumeEditTextarea = document.getElementById('resumeEditTextarea');
    const closeEditBtn = document.getElementById('closeEditBtn');
    const saveDataBtn = document.getElementById('saveDataBtn');

    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    let currentResumeData = null;
    let applicationHistory = [];

    // --- Tab Switching ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(targetTab).classList.remove('hidden');
            if (targetTab === 'history-tab') renderHistory();
        });
    });

    // --- UI State Management ---
    function updateUIState() {
        if (currentResumeData) {
            setupSuccess.classList.remove('hidden');
            fillFormBtn.disabled = false;
            fillFormBtn.style.opacity = '1';
        } else {
            setupSuccess.classList.add('hidden');
            fillFormBtn.disabled = true;
            fillFormBtn.style.opacity = '0.5';
            resumePreview.classList.add('hidden');
            viewDataBtn.textContent = 'View Stored Data';
            pdfStatusText.textContent = 'Upload PDF';
        }
    }

    // --- Bootstrapping ---
    chrome.storage.local.get(['resumeData', 'resumeFile', 'applicationHistory'], (result) => {
        if (result.resumeData) {
            currentResumeData = result.resumeData;
        }
        if (result.resumeFile) {
            pdfStatusText.textContent = `📎 ${result.resumeFile.name}`;
        } else {
            pdfStatusText.textContent = 'Upload PDF';
        }
        if (result.applicationHistory) applicationHistory = result.applicationHistory;
        updateUIState();
    });

    // --- Upload Logic ---
    resumeInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const rawText = e.target.result;
                const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
                const json = JSON.parse(text);
                saveResumeData(json);
                // Trigger auto-validation
                setTimeout(() => validateJsonBtn.click(), 100);
            } catch (error) {
                showStatus('Invalid JSON file', 'error');
            }
        };
        reader.readAsText(file);
    });

    function saveResumeData(json) {
        currentResumeData = json;
        const normalized = ResumeProcessor.normalize(json);
        chrome.storage.local.set({ 
            resumeData: json, 
            normalizedData: normalized 
        }, () => {
            updateUIState();
            showStatus('Resume profile saved!', 'success');
        });
    }

    // --- Edit Data Logic ---
    editDataBtn.addEventListener('click', () => {
        resumeEditTextarea.value = JSON.stringify(currentResumeData, null, 2);
        editSection.classList.remove('hidden');
    });

    closeEditBtn.addEventListener('click', () => {
        editSection.classList.add('hidden');
    });

    saveDataBtn.addEventListener('click', () => {
        try {
            const json = JSON.parse(resumeEditTextarea.value);
            saveResumeData(json);
            editSection.classList.add('hidden');
        } catch (e) {
            showStatus('Invalid JSON format', 'error');
        }
    });

    // --- Validation Logic ---
    validateJsonBtn.addEventListener('click', () => {
        if (!currentResumeData) return;
        
        try {
            const norm = ResumeProcessor.normalize(currentResumeData);
            const missing = [];
            if (!norm.identity?.first_name) missing.push("Name");
            if (!norm.contact?.email) missing.push("Email");
            if (!norm.employment?.history || norm.employment.history.length === 0) missing.push("Work Experience");
            
            if (missing.length > 0) {
                showStatus(`Missing: ${missing.join(', ')}`, 'error');
            } else {
                showStatus('JSON is valid and complete!', 'success');
            }
        } catch (err) {
            showStatus('Invalid JSON format', 'error');
        }
    });

    // --- PDF Management ---
    uploadPdfBtn.addEventListener('click', () => {
        resumeFileInput.click();
    });

    resumeFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const resumeFileData = {
                data: e.target.result,
                name: file.name,
                type: file.type,
                size: file.size
            };
            chrome.storage.local.set({ resumeFile: resumeFileData }, () => {
                pdfStatusText.textContent = `📎 ${file.name}`;
                showStatus('Resume document saved!', 'success');
            });
        };
        reader.readAsDataURL(file);
    });

    validatePdfBtn.addEventListener('click', () => {
        chrome.storage.local.get(['resumeFile'], (result) => {
            if (!result.resumeFile) {
                showStatus('Please upload a PDF/DOCX first', 'error');
                return;
            }
            const file = result.resumeFile;
            const name = (file.name || '').toLowerCase();
            if (name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx')) {
                showStatus('Document format is valid!', 'success');
            } else {
                showStatus('Invalid format. Must be PDF or DOCX', 'error');
            }
        });
    });

    // --- View Logic ---
    viewDataBtn.addEventListener('click', () => {
        const isHidden = resumePreview.classList.toggle('hidden');
        viewDataBtn.textContent = isHidden ? 'View Stored Data' : 'Hide Stored Data';
        if (!isHidden) updatePreview();
    });

    function updatePreview() {
        if (!currentResumeData) return;
        resumeContent.textContent = JSON.stringify(currentResumeData, null, 2);
    }

    // --- Delete Profile ---
    deleteProfileBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to remove all your resume data? This will clear both JSON and PDF files.')) {
            chrome.storage.local.set({ 
                resumeData: null, 
                normalizedData: null, 
                resumeFile: null 
            }, () => {
                currentResumeData = null;
                updateUIState();
                showStatus('All data cleared', 'success');
            });
        }
    });

    // --- Fill Logic ---
    fillFormBtn.addEventListener('click', () => {
        chrome.storage.local.get(['resumeFile'], (storage) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTabId = tabs[0]?.id;
                if (!activeTabId) return;

                chrome.tabs.sendMessage(activeTabId, {
                    action: "fill_form", 
                    data: currentResumeData,
                    normalizedData: ResumeProcessor.normalize(currentResumeData),
                    resumeFile: storage.resumeFile,
                    manual: true
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        showStatus('Could not reach page', 'error');
                    } else {
                        showStatus('Fill initiated!', 'success');
                    }
                });
            });
        });
    });

    // --- Progress Tracking ---
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'update_progress') {
            const { filled, total } = msg;
            progressSection.classList.remove('hidden');
            progressCount.textContent = `${filled}/${total} fields`;
            const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
            progressBar.style.width = `${percentage}%`;
        }
    });

    // --- Status Messages ---
    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = `status-message status-${type}`;
        statusDiv.classList.remove('hidden');
        setTimeout(() => { statusDiv.classList.add('hidden'); }, 3000);
    }

    // --- History ---
    function renderHistory() {
        if (applicationHistory.length === 0) {
            historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 20px;">No applications logged yet.</p>';
            return;
        }
        const sorted = [...applicationHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
        historyList.innerHTML = sorted.map(item => `
            <div class="history-item">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <p class="history-company">${item.company || 'Company'}</p>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                </div>
                <p class="history-role">${item.role || 'Job Application'}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="history-status status-${item.status}">${item.status}</span>
                        ${item.total ? `<span class="history-progress">${item.filled}/${item.total} fields</span>` : ''}
                    </div>
                    <a href="${item.url}" target="_blank" class="history-link">View Job ↗</a>
                </div>
            </div>
        `).join('');
    }

    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Clear all history?')) {
            applicationHistory = [];
            chrome.storage.local.set({ applicationHistory: [] }, () => {
                renderHistory();
            });
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.applicationHistory) {
            applicationHistory = changes.applicationHistory.newValue || [];
            if (!document.getElementById('history-tab').classList.contains('hidden')) renderHistory();
        }
    });
});
