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
    
    const resumeEditTextarea = document.getElementById('resumeEditTextarea');
    const saveDataBtn = document.getElementById('saveDataBtn');

    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    let currentResumeData = null;
    let currentResumeFile = null;
    let applicationHistory = [];

    const sampleDownloadBtn = document.getElementById('sampleDownloadBtn');

    // --- Tab Switching ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(targetTab).classList.remove('hidden');

            // Show/Hide Sample PDF button based on tab
            if (targetTab === 'home-tab') {
                sampleDownloadBtn.classList.remove('hidden');
            } else {
                sampleDownloadBtn.classList.add('hidden');
            }

            if (targetTab === 'history-tab') renderHistory();
            if (targetTab === 'manage-tab') {
                if (currentResumeData) {
                    resumeEditTextarea.value = JSON.stringify(currentResumeData, null, 2);
                } else {
                    resumeEditTextarea.value = '';
                }
            }
        });
    });

    // --- UI State Management ---
    function updateUIState() {
        const jsonValid = validateJsonData(currentResumeData).valid;
        const pdfValid = validatePdfFile(currentResumeFile).valid;

        if (jsonValid && pdfValid) {
            if (setupSuccess) setupSuccess.classList.remove('hidden');
            fillFormBtn.disabled = false;
            fillFormBtn.style.opacity = '1';
        } else {
            if (setupSuccess) setupSuccess.classList.add('hidden');
            fillFormBtn.disabled = true;
            fillFormBtn.style.opacity = '0.5';
        }

        if (currentResumeFile) {
            pdfStatusText.textContent = `File: ${currentResumeFile.name}`;
        } else {
            pdfStatusText.textContent = 'Upload PDF';
        }
    }

    // --- Bootstrapping ---
    chrome.storage.local.get(['resumeData', 'resumeFile', 'applicationHistory'], (result) => {
        if (result.resumeData) {
            currentResumeData = result.resumeData;
        }
        if (result.resumeFile) {
            currentResumeFile = result.resumeFile;
            pdfStatusText.textContent = `File: ${result.resumeFile.name}`;
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
                
                // Validate before saving
                const validation = validateJsonData(json);
                if (validation.valid) {
                    saveResumeData(json);
                    showStatus('JSON uploaded and validated!', 'success');
                } else {
                    showStatus(`Validation Error: ${validation.message}`, 'error');
                }
            } catch (error) {
                showStatus('Invalid JSON file', 'error');
            }
        };
        reader.readAsText(file);
    });

    function saveResumeData(json, successMessage = 'Resume profile saved!') {
        try {
            currentResumeData = json;
            const normalized = ResumeProcessor.normalize(json);
            chrome.storage.local.set({ 
                resumeData: json, 
                normalizedData: normalized 
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Storage error:', chrome.runtime.lastError);
                    showStatus('Error saving to storage: ' + chrome.runtime.lastError.message, 'error');
                } else {
                    updateUIState();
                    showStatus(successMessage, 'success');
                }
            });
        } catch (err) {
            console.error('Normalization error:', err);
            showStatus('Error processing resume data', 'error');
        }
    }

    // --- Edit Data Logic ---
    saveDataBtn.addEventListener('click', () => {
        try {
            const rawText = resumeEditTextarea.value.trim();
            if (!rawText) {
                showStatus('Please enter resume JSON', 'error');
                return;
            }

            const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
            const json = JSON.parse(text);
            
            const validation = validateJsonData(json);
            if (validation.valid) {
                // Re-format JSON for the user
                resumeEditTextarea.value = JSON.stringify(json, null, 2);
                saveResumeData(json, 'Changes saved successfully!');
            } else {
                showStatus(`Validation Error: ${validation.message}`, 'error');
            }
        } catch (e) {
            showStatus('Invalid JSON format: ' + e.message, 'error');
        }
    });

    // --- Validation Helpers ---
    function validateJsonData(data) {
        if (!data) return { valid: false, message: 'No data provided' };
        try {
            const norm = ResumeProcessor.normalize(data);
            const missing = [];
            if (!norm.identity?.first_name) missing.push("Name");
            if (!norm.contact?.email) missing.push("Email");
            if (!norm.employment?.history || norm.employment.history.length === 0) missing.push("Work Experience");
            
            if (missing.length > 0) {
                return { valid: false, message: `Missing: ${missing.join(', ')}` };
            }
            return { valid: true };
        } catch (err) {
            return { valid: false, message: 'Invalid resume format' };
        }
    }


    function validatePdfFile(file) {
        if (!file) return { valid: false, message: 'No file uploaded' };
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx')) {
            return { valid: true };
        }
        return { valid: false, message: 'Invalid format. Must be PDF or DOCX' };
    }

    // --- PDF Management ---
    uploadPdfBtn.addEventListener('click', () => {
        resumeFileInput.click();
    });

    resumeFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validate PDF before saving
        const validation = validatePdfFile(file);
        if (!validation.valid) {
            showStatus(validation.message, 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const resumeFileData = {
                data: e.target.result,
                name: file.name,
                type: file.type,
                size: file.size
            };
            chrome.storage.local.set({ resumeFile: resumeFileData }, () => {
                currentResumeFile = resumeFileData;
                pdfStatusText.textContent = `File: ${file.name}`;
                updateUIState();
                showStatus('Resume document saved and validated!', 'success');
            });
        };
        reader.readAsDataURL(file);
    });



    // --- Delete Profile ---
    deleteProfileBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to remove all your resume data? This will clear both JSON and PDF files.')) {
            chrome.storage.local.set({ 
                resumeData: null, 
                normalizedData: null, 
                resumeFile: null 
            }, () => {
                currentResumeData = null;
                currentResumeFile = null;
                if (resumeEditTextarea) resumeEditTextarea.value = '';
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
    let statusTimeout = null;
    function showStatus(msg, type) {
        if (statusTimeout) clearTimeout(statusTimeout);
        
        statusDiv.textContent = msg;
        statusDiv.className = `status-message status-${type}`;
        statusDiv.classList.remove('hidden');
        
        statusTimeout = setTimeout(() => {
            statusDiv.classList.add('hidden');
            statusTimeout = null;
        }, 3000);
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
