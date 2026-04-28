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
    const nextPageBtn = document.getElementById('nextPageBtn');

    // History Tab Elements
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // Summary Panel Elements
    const summaryPanelContainer = document.getElementById('summaryPanelContainer');
    const summaryTableBody = document.getElementById('summaryTableBody');
    const applyEditsBtn = document.getElementById('applyEditsBtn');

    // const atsSelector = document.getElementById('atsSelector');
    // const customAnswersInput = document.getElementById('customAnswersInput');
    // const saveCustomAnswersBtn = document.getElementById('saveCustomAnswersBtn');

    // Auto-Apply Queue Elements
    const jobsInput = document.getElementById('jobsInput');
    const jobsFileName = document.getElementById('jobsFileName');
    const startQueueBtn = document.getElementById('startQueueBtn');
    const stopQueueBtn = document.getElementById('stopQueueBtn');
    const queueStatus = document.getElementById('queueStatus');

    // Keep track of the current tab ID logic executes on 
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
    let autoApplyJobs = [];
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
    chrome.storage.local.get(['resumeData', 'customAtsAnswers', 'savedProfiles', 'activeProfileName', 'normalizedData', 'resumeFile', 'autoRunActive', 'currentJobIndex', 'totalJobs', 'jobQueue', 'applicationHistory'], (result) => {
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

        if (result.autoRunActive) {
            autoApplyJobs = result.jobQueue || [];
            queueStatus.textContent = `Processing job ${(result.currentJobIndex || 0) + 1} of ${(result.totalJobs || result.jobQueue?.length || 0)}...`;
            startQueueBtn.disabled = true;
            stopQueueBtn.disabled = false;
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

    // --- 2. AI Toggle and Config Handlers Removed ---

    // --- 3. Gemini API Key Handler Removed ---

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

    if (jobsInput) {
        jobsInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.json')) {
                showStatus('Please choose a .json file for jobs', 'error');
                return;
            }
            jobsFileName.textContent = `📎 ${file.name}`;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target?.result || '';
                    if (!text) throw new Error('Empty file contents');
                    let json = JSON.parse(text);
                    if (json && !Array.isArray(json)) {
                        if (json.basics || json.work || json.education || json.skills) {
                            throw new Error('This looks like a Resume! Upload to Resume Profile Manager.');
                        }
                        if (json.by_ats) {
                            let flattened = [];
                            for (const platform in json.by_ats) {
                                (json.by_ats[platform] || []).forEach(job => {
                                    if (job.ats_url) {
                                        let company = "Unknown";
                                        if (job.title) {
                                            const parts = job.title.split('\n');
                                            company = parts.length >= 6 ? parts[5].trim() : (parts.length >= 1 ? parts[0].trim() : "Unknown");
                                        }
                                        flattened.push({ url: job.ats_url, company });
                                    }
                                });
                            }
                            json = flattened;
                        } else if (Array.isArray(json.jobs)) {
                            json = json.jobs;
                        }
                    }
                    if (!Array.isArray(json)) throw new Error('Jobs file must be an array of objects.');
                    autoApplyJobs = json;
                    startQueueBtn.disabled = autoApplyJobs.length === 0;
                    queueStatus.textContent = `Loaded ${autoApplyJobs.length} jobs.`;
                    // console.log("SidePanel: Jobs loaded successfully. Total:", autoApplyJobs.length);
                    showStatus('Jobs loaded successfully', 'success');
                    if (autoApplyJobs.length > 0) {
                        if (activeProfileName) {
                            queueStatus.textContent = 'Auto-starting queue in 1s...';
                            // console.log("SidePanel: Auto-starting queue because profile is active:", activeProfileName);
                            setTimeout(() => {
                                // console.log("SidePanel: Triggering startQueueBtn click");
                                startQueueBtn.click();
                            }, 1000);
                        } else {
                            queueStatus.textContent = 'Blocked: Pick a Resume Profile.';
                            // console.log("SidePanel: Queue auto-start blocked: no active profile");
                            showStatus('Please pick a Resume Profile to begin.', 'error');
                        }
                    }
                } catch (error) {
                    showStatus('Invalid jobs JSON.', 'error');
                    console.error('Jobs JSON Parse Error:', error);
                }
            };
            reader.readAsText(file);
        });
    }

    if (startQueueBtn) {
        startQueueBtn.addEventListener('click', () => {
            // console.log("SidePanel: startQueueBtn clicked. jobs.length:", autoApplyJobs.length, "profile:", activeProfileName);
            if (!activeProfileName) {
                showStatus('Please upload or select a resume profile first.', 'error');
                return;
            }
            if (autoApplyJobs.length === 0) {
                console.warn("SidePanel: startQueueBtn clicked but autoApplyJobs is empty");
                return;
            }
            if (!savedProfiles[activeProfileName]?.normalizedData) {
                showStatus('Resume profile missing data.', 'error');
                console.warn("SidePanel: Active profile missing normalizedData");
                return;
            }
            chrome.storage.local.set({
                activeProfileName: activeProfileName,
                resumeData: savedProfiles[activeProfileName].resumeData,
                normalizedData: savedProfiles[activeProfileName].normalizedData,
                resumeFile: savedProfiles[activeProfileName].resumeFile
            }, () => {
                // console.log("SidePanel: Profile data saved to storage. Pinging background...");
                chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
                    if (chrome.runtime.lastError) {
                        showStatus('Connecting to extension...', 'error');
                        console.error("SidePanel: Ping failed:", chrome.runtime.lastError);
                        return;
                    }
                    // console.log("SidePanel: Ping success. Sending start_queue with", autoApplyJobs.length, "jobs");
                    chrome.runtime.sendMessage({ action: 'start_queue', jobs: autoApplyJobs }, (response) => {
                        if (chrome.runtime.lastError) {
                            showStatus('Error starting queue.', 'error');
                            console.error("SidePanel: start_queue failed:", chrome.runtime.lastError);
                        } else {
                            startQueueBtn.disabled = true;
                            stopQueueBtn.disabled = false;
                            showStatus('Queue Started', 'success');
                            // console.log("SidePanel: Queue start acknowledged by background");
                        }
                    });
                });
            });
        });
    }

    if (stopQueueBtn) {
        stopQueueBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'stop_queue' }, (response) => {
                if (!chrome.runtime.lastError) {
                    startQueueBtn.disabled = false;
                    stopQueueBtn.disabled = true;
                    showStatus('Queue Stopped', 'success');
                }
            });
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'queue_status_update') {
            if (request.data.status === 'running') {
                queueStatus.textContent = `Processing job ${request.data.currentIndex + 1} of ${request.data.totalJobs}...`;
                startQueueBtn.disabled = true;
                stopQueueBtn.disabled = false;
            } else if (request.data.status === 'stopped' || request.data.status === 'completed') {
                queueStatus.textContent = request.data.status === 'completed' ? 'Queue Completed!' : 'Queue Stopped.';
                startQueueBtn.disabled = false;
                stopQueueBtn.disabled = true;
            }
        }
        if (request.action === 'fill_report') {
            activeTabId = sender.tab.id;
            renderSummaryTable(request.report);
            sendResponse({ status: 'ok' });
        }
    });

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

    if (applyEditsBtn) {
        applyEditsBtn.addEventListener('click', () => {
            const editedData = [];
            summaryTableBody.querySelectorAll('tr').forEach(row => {
                const fieldId = row.dataset.fieldid;
                const input = row.querySelector('.edit-input');
                if (fieldId && input) editedData.push({ id: fieldId, value: input.value });
            });
            if (activeTabId && editedData.length > 0 && chrome.tabs) {
                // Save edits to profile
                if (activeProfileName && savedProfiles[activeProfileName]) {
                    if (!savedProfiles[activeProfileName].manualEdits) savedProfiles[activeProfileName].manualEdits = {};
                    editedData.forEach(edit => {
                        savedProfiles[activeProfileName].manualEdits[edit.id] = edit.value;
                    });
                    chrome.storage.local.set({ savedProfiles: savedProfiles });
                }

                chrome.tabs.sendMessage(activeTabId, { action: 'apply_edits', edits: editedData }, () => {
                    showStatus('Edits applied and saved to profile!', 'success');
                });
            }
        });
    }

    if (viewResumeBtn) {
        viewResumeBtn.addEventListener('click', () => {
            if (resumePreview) {
                resumePreview.classList.toggle('hidden');
                viewResumeBtn.textContent = resumePreview.classList.contains('hidden') ? 'View Stored Data' : 'Hide Data';
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTabId = tabs[0]?.id;
                if (activeTabId) {
                    chrome.tabs.sendMessage(activeTabId, { action: "auto_submit" }, (response) => {
                        showStatus(chrome.runtime.lastError ? 'Error.' : 'Triggered!', chrome.runtime.lastError ? 'error' : 'success');
                    });
                }
            });
        });
    }

    function renderSummaryTable(reportData) {
        // Clear children safely
        while (summaryTableBody.firstChild) {
            summaryTableBody.removeChild(summaryTableBody.firstChild);
        }

        if (!reportData || reportData.length === 0) {
            summaryPanelContainer.classList.add('hidden');
            return;
        }
        reportData.forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.fieldid = item.id;
            tr.dataset.label = item.label;

            const tdLabel = document.createElement('td');
            tdLabel.style.display = 'flex';
            tdLabel.style.alignItems = 'center';
            tdLabel.textContent = item.label.substring(0, 20) + (item.label.length > 20 ? '...' : '');

            // AI Regenerate Button Removed
            // tdLabel.appendChild(aiBtn); (removed)

            const tdValue = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text'; input.className = 'edit-input'; input.value = item.value || '';
            tdValue.appendChild(input);

            const tdStatus = document.createElement('td');
            let badgeClass = 'badge-red';
            let statusText = 'Missed';
            if (item.status === 'filled') {
                badgeClass = 'badge-green';
                statusText = `${item.confidence}%`;
            } else if (item.status === 'low_confidence') {
                badgeClass = 'badge-yellow';
                statusText = `${item.confidence}%`;
            }

            const badge = document.createElement('span');
            badge.className = `badge ${badgeClass}`;
            badge.textContent = statusText;
            tdStatus.appendChild(badge);

            tr.append(tdLabel, tdValue, tdStatus);
            summaryTableBody.appendChild(tr);
        });
        summaryPanelContainer.classList.remove('hidden');
    }

    // --- 4. triggerSingleAIFill Handler Removed ---

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
        if (nextPageBtn) nextPageBtn.disabled = false;
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
