document.addEventListener('DOMContentLoaded', () => {
    // Bail early when the script is loaded outside of an extension context
    if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Side panel script running outside Chrome extension context, aborting.');
        return;
    }

    // Connect to background and signal window ID for context isolation
    const port = chrome.runtime.connect({ name: "sidepanel" });
    chrome.windows.getCurrent((win) => {
        if (win && win.id) {
            port.postMessage({ action: 'register_window', windowId: win.id });
        }
    });

    const resumeInput = document.getElementById('resumeInput');
    const fillFormBtn = document.getElementById('fillFormBtn');
    const viewResumeBtn = document.getElementById('viewResumeBtn');
    const statusDiv = document.getElementById('status');
    const resumePreview = document.getElementById('resumePreview');
    const resumeContent = document.getElementById('resumeContent');
    const profileSelect = document.getElementById('profileSelect');
    const deleteProfileBtn = document.getElementById('deleteProfileBtn');


    // History Tab Elements
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');



    // const atsSelector = document.getElementById('atsSelector');
    // const customAnswersInput = document.getElementById('customAnswersInput');
    // const saveCustomAnswersBtn = document.getElementById('saveCustomAnswersBtn');



    let activeTabId = null;
    let customAtsAnswers = {
        Generic: {}, Greenhouse: {}, Lever: {}, Workday: {}, SuccessFactors: {},
        Adp: {}, Ashby: {}, SmartRecruiters: {}, Icims: {}, Jobvite: {},
        Taleo: {}, Workable: {}, BambooHr: {}, Paycom: {}, Paychex: {},
        Ultipro: {}, Linkedin: {}, Indeed: {}, Recruitee: {}, Teamtailor: {},
        Personio: {}, OracleCloud: {}, ApplyToJob: {}, Brassring: {}, Rippling: {}
    };

    let savedProfiles = {};
    let activeProfileName = null;

    let applicationHistory = [];

    // --- 0. Tab Switching Logic ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Toggle Buttons
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle Content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(targetTab).classList.remove('hidden');

            if (targetTab === 'history-tab') {
                renderHistory();
            }
        });
    });

    // --- 1. Settings Bootstrapping ---
    chrome.storage.local.get(['resumeData', 'customAtsAnswers', 'savedProfiles', 'activeProfileName', 'normalizedData', 'resumeFile', 'applicationHistory'], (result) => {
        // Settings bootstrapping for non-AI features
        if (result.customAtsAnswers) {
            customAtsAnswers = { ...customAtsAnswers, ...result.customAtsAnswers };
        }
        // updateCustomAnswersTextarea();

        if (result.savedProfiles) {
            savedProfiles = result.savedProfiles;
        }

        if (!result.savedProfiles && result.resumeData) {
            const legacyName = "resume (legacy)";
            savedProfiles[legacyName] = {
                resumeData: result.resumeData,
                normalizedData: result.normalizedData,
                resumeFile: result.resumeFile
            };
            activeProfileName = legacyName;
            chrome.storage.local.set({ savedProfiles: savedProfiles, activeProfileName: activeProfileName });
        } else if (result.activeProfileName && savedProfiles[result.activeProfileName]) {
            activeProfileName = result.activeProfileName;
        } else if (Object.keys(savedProfiles).length > 0) {
            activeProfileName = Object.keys(savedProfiles)[0];
            chrome.storage.local.set({ activeProfileName: activeProfileName });
        }



        if (result.applicationHistory) {
            applicationHistory = result.applicationHistory;
        }

        renderProfileDropdown();
    });

    // --- 2. Custom ATS Answers Section Removed ---
    /*
    atsSelector.addEventListener('change', () => {
        updateCustomAnswersTextarea();
    });

    saveCustomAnswersBtn.addEventListener('click', () => {
        const selectedAts = atsSelector.value;
        const inputText = customAnswersInput.value.trim();
        try {
            if (inputText) {
                const parsedJson = JSON.parse(inputText);
                customAtsAnswers[selectedAts] = parsedJson;
            } else {
                customAtsAnswers[selectedAts] = {};
            }
            chrome.storage.local.set({ customAtsAnswers: customAtsAnswers }, () => {
                showStatus('Custom Answers Saved!', 'success');
            });
        } catch (error) {
            showStatus('Invalid JSON format.', 'error');
            console.error('JSON Parse Error:', error);
        }
    });

    function updateCustomAnswersTextarea() {
        const selectedAts = atsSelector.value;
        const data = customAtsAnswers[selectedAts] || {};
        customAnswersInput.value = Object.keys(data).length === 0 ? '' : JSON.stringify(data, null, 2);
    }
    */



    function renderProfileDropdown() {
        const profileNames = Object.keys(savedProfiles);
        profileSelect.innerHTML = '';
        if (profileNames.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No Profiles Found - Please Upload";
            profileSelect.appendChild(option);
            deleteProfileBtn.disabled = true;
            fillFormBtn.disabled = true;
            viewResumeBtn.disabled = true;
            const resumeFileName = document.getElementById('resumeFileName');
            if (resumeFileName) resumeFileName.textContent = "Upload PDF/DOCX";
            return;
        }
        profileNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (name === activeProfileName) option.selected = true;
            profileSelect.appendChild(option);
        });
        deleteProfileBtn.disabled = false;
        syncActiveProfileToRoot();
    }

    function syncActiveProfileToRoot() {
        if (!activeProfileName || !savedProfiles[activeProfileName]) return;
        const profileData = savedProfiles[activeProfileName];
        chrome.storage.local.set({
            activeProfileName: activeProfileName,
            resumeData: profileData.resumeData,
            normalizedData: profileData.normalizedData,
            resumeFile: profileData.resumeFile
        }, () => {
            enableButtons();
            showStatus(`Profile "${activeProfileName}" Active`, 'success');
            updatePreview(profileData.resumeData);
            const resumeFileName = document.getElementById('resumeFileName');
            if (resumeFileName) {
                resumeFileName.textContent = profileData.resumeFile ? `📎 ${profileData.resumeFile.name}` : "Upload PDF/DOCX";
            }
        });
    }

    if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
            activeProfileName = e.target.value;
            syncActiveProfileToRoot();
        });
    }

    if (deleteProfileBtn) {
        deleteProfileBtn.addEventListener('click', () => {
            if (activeProfileName && savedProfiles[activeProfileName]) {
                delete savedProfiles[activeProfileName];
                const remainingProfiles = Object.keys(savedProfiles);
                if (remainingProfiles.length > 0) {
                    activeProfileName = remainingProfiles[0];
                } else {
                    activeProfileName = null;
                    chrome.storage.local.remove(['resumeData', 'normalizedData', 'resumeFile']);
                    updatePreview({});
                }
                chrome.storage.local.set({ savedProfiles: savedProfiles }, () => {
                    renderProfileDropdown();
                });
            }
        });
    }

    if (resumeInput) {
        resumeInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.json')) {
                showStatus('Please choose a .json file', 'error');
                return;
            }
            const newProfileName = file.name.replace(/\.[^/.]+$/, "");
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const rawText = e.target?.result || '';
                    if (!rawText) throw new Error('Empty file contents');
                    // Strip illegal ASCII control characters (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F)
                    // that sometimes appear in files generated from Word/PDF/AI tools and are
                    // invalid inside JSON string values, causing "Bad control character" errors.
                    const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
                    const json = JSON.parse(text);
                    const normalizedData = ResumeProcessor.normalize(json);
                    let retainedFile = (savedProfiles[newProfileName] && savedProfiles[newProfileName].resumeFile) ? savedProfiles[newProfileName].resumeFile : null;
                    savedProfiles[newProfileName] = { resumeData: json, normalizedData: normalizedData, resumeFile: retainedFile };
                    activeProfileName = newProfileName;
                    chrome.storage.local.set({ savedProfiles: savedProfiles }, () => {
                        renderProfileDropdown();
                    });
                } catch (error) {
                    showStatus(`Failed to load JSON: ${error.message}`, 'error');
                    console.error('Resume upload error:', error);
                }
            };
            reader.readAsText(file);
        });
    }

    const resumeFileInput = document.getElementById('resumeFileInput');
    if (resumeFileInput) {
        resumeFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                if (!activeProfileName || !savedProfiles[activeProfileName]) {
                    showStatus('Upload a JSON resume first!', 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    const resumeFileData = { data: e.target.result, name: file.name, type: file.type, size: file.size };
                    savedProfiles[activeProfileName].resumeFile = resumeFileData;
                    chrome.storage.local.set({ savedProfiles: savedProfiles }, () => {
                        syncActiveProfileToRoot();
                    });
                };
                reader.readAsDataURL(file);
            }
        });
    }





    fillFormBtn.addEventListener('click', () => {
        chrome.storage.local.get(['resumeData', 'resumeFile'], (result) => {
            if (result.resumeData && chrome.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    activeTabId = tabs[0]?.id;
                    if (activeTabId) {
                        const profile = savedProfiles[activeProfileName] || {};
                        chrome.tabs.sendMessage(activeTabId, {
                            action: "fill_form", data: result.resumeData,
                            normalizedData: ResumeProcessor.normalize(result.resumeData),
                            manualEdits: profile.manualEdits || {},
                            resumeFile: result.resumeFile,
                            manual: true
                        }, (response) => {
                            showStatus(chrome.runtime.lastError ? 'Error.' : 'Initiated!', chrome.runtime.lastError ? 'error' : 'success');
                        });
                    }
                });
            }
        });
    });


    if (viewResumeBtn) {
        viewResumeBtn.addEventListener('click', () => {
            if (resumePreview) {
                resumePreview.classList.toggle('hidden');
                viewResumeBtn.textContent = resumePreview.classList.contains('hidden') ? 'View Stored Data' : 'Hide Data';
            }
        });
    }

    function showStatus(msg, type) {
        if (!statusDiv) return;
        statusDiv.textContent = msg;
        statusDiv.className = `status-message status-${type}`;
        statusDiv.classList.remove('hidden');
        setTimeout(() => { statusDiv.classList.add('hidden'); }, 3000);
    }

    function enableButtons() {
        if (fillFormBtn) fillFormBtn.disabled = false;
        if (viewResumeBtn) viewResumeBtn.disabled = false;

    }

    function updatePreview(data) {
        if (!resumeContent) return;
        resumeContent.textContent = JSON.stringify({ _normalized: ResumeProcessor.normalize(data), _raw: data }, null, 2);
    }

    // --- History Functions ---
    function renderHistory() {
        if (!applicationHistory || applicationHistory.length === 0) {
            historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 20px;">No applications logged yet.</p>';
            return;
        }

        // Sort by date descending
        const sortedHistory = [...applicationHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

        historyList.innerHTML = sortedHistory.map(item => `
            <div class="history-item">
                <div class="history-item-header">
                    <p class="history-company">${item.company || 'Unknown Company'}</p>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                </div>
                <p class="history-role">${item.role || 'Job Application'}</p>
                <div class="history-footer">
                    <span class="history-status status-${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span>
                    <a href="${item.url}" target="_blank" class="history-link">View Job ↗</a>
                </div>
            </div>
        `).join('');
    }

    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your entire application history?')) {
            applicationHistory = [];
            chrome.storage.local.set({ applicationHistory: [] }, () => {
                renderHistory();
                showStatus('History cleared.', 'success');
            });
        }
    });

    // Listen for storage changes to refresh history if it's open
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.applicationHistory) {
            applicationHistory = changes.applicationHistory.newValue || [];
            if (!document.getElementById('history-tab').classList.contains('hidden')) {
                renderHistory();
            }
        }
    });

});
