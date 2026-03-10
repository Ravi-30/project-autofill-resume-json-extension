document.addEventListener('DOMContentLoaded', () => {
    // Bail early when the script is loaded outside of an extension context
    if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Side panel script running outside Chrome extension context, aborting.');
        return;
    }

    const resumeInput = document.getElementById('resumeInput');
    const fillFormBtn = document.getElementById('fillFormBtn');
    const viewResumeBtn = document.getElementById('viewResumeBtn');
    const statusDiv = document.getElementById('status');
    const resumePreview = document.getElementById('resumePreview');
    const resumeContent = document.getElementById('resumeContent');
    const profileSelect = document.getElementById('profileSelect');
    const deleteProfileBtn = document.getElementById('deleteProfileBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    // Summary Panel Elements
    const summaryPanelContainer = document.getElementById('summaryPanelContainer');
    const summaryTableBody = document.getElementById('summaryTableBody');
    const applyEditsBtn = document.getElementById('applyEditsBtn');

    const atsSelector = document.getElementById('atsSelector');
    const customAnswersInput = document.getElementById('customAnswersInput');
    const saveCustomAnswersBtn = document.getElementById('saveCustomAnswersBtn');

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

    // --- 1. Settings Bootstrapping ---
    chrome.storage.local.get(['resumeData', 'aiEnabled', 'geminiApiKey', 'customAtsAnswers', 'savedProfiles', 'activeProfileName', 'normalizedData', 'resumeFile', 'autoRunActive', 'currentJobIndex', 'totalJobs', 'jobQueue'], (result) => {
        console.log("SidePanel: Loaded storage data", result);
        if (result.aiEnabled) {
            console.log("SidePanel: AI is enabled in storage");
            document.getElementById('aiToggle').checked = true;
            document.getElementById('aiConfig').classList.remove('hidden');
        } else {
            console.log("SidePanel: AI is disabled in storage");
        }
        if (result.geminiApiKey) {
            console.log("SidePanel: Gemini API Key found in storage");
            document.getElementById('geminiApiKey').value = result.geminiApiKey;
        }
        if (result.customAtsAnswers) {
            customAtsAnswers = { ...customAtsAnswers, ...result.customAtsAnswers };
        }
        updateCustomAnswersTextarea();

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

        renderProfileDropdown();
    });

    // Handle ATS Selector Change
    atsSelector.addEventListener('change', () => {
        updateCustomAnswersTextarea();
    });

    // Handle Custom Answers Save
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

    // Handle AI Toggle
    const aiToggle = document.getElementById('aiToggle');
    if (aiToggle) {
        aiToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            console.log("SidePanel: AI Toggle changed to", enabled);
            chrome.storage.local.set({ aiEnabled: enabled }, () => {
                console.log("SidePanel: aiEnabled saved to storage");
            });
            if (enabled) {
                document.getElementById('aiConfig').classList.remove('hidden');
            } else {
                document.getElementById('aiConfig').classList.add('hidden');
            }
        });
    }

    // Handle API Key Input
    const geminiApiKeyInput = document.getElementById('geminiApiKey');
    if (geminiApiKeyInput) {
        geminiApiKeyInput.addEventListener('input', (e) => {
            chrome.storage.local.set({ geminiApiKey: e.target.value });
        });
    }

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
                    const text = e.target?.result || '';
                    if (!text) throw new Error('Empty file contents');
                    const json = JSON.parse(text);
                    const normalizedData = ResumeProcessor.normalize(json);
                    let retainedFile = (savedProfiles[newProfileName] && savedProfiles[newProfileName].resumeFile) ? savedProfiles[newProfileName].resumeFile : null;
                    savedProfiles[newProfileName] = { resumeData: json, normalizedData: normalizedData, resumeFile: retainedFile };
                    activeProfileName = newProfileName;
                    chrome.storage.local.set({ savedProfiles: savedProfiles }, () => {
                        renderProfileDropdown();
                    });
                } catch (error) {
                    showStatus('Failed to load JSON resume.', 'error');
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
        chrome.storage.local.get(['resumeData', 'aiEnabled', 'resumeFile'], (result) => {
            if (result.resumeData && chrome.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    activeTabId = tabs[0]?.id;
                    if (activeTabId) {
                        chrome.tabs.sendMessage(activeTabId, {
                            action: "fill_form", data: result.resumeData,
                            normalizedData: ResumeProcessor.normalize(result.resumeData),
                            aiEnabled: result.aiEnabled || false,
                            resumeFile: result.resumeFile,
                            manual: true
                        }, (response) => {
                            console.log("SidePanel: Manual fill triggered. aiEnabled passed:", result.aiEnabled || false);
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
                chrome.tabs.sendMessage(activeTabId, { action: 'apply_edits', edits: editedData }, () => {
                    showStatus('Edits applied!', 'success');
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
        summaryTableBody.innerHTML = '';
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

            // AI Regenerate Button
            const aiBtn = document.createElement('button');
            aiBtn.className = 'ai-regen-btn';
            aiBtn.title = 'Regenerate with Gemini ✨';
            aiBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path>
                </svg>
            `;
            aiBtn.onclick = () => triggerSingleAIFill(item.id, item.label, tr);
            tdLabel.appendChild(aiBtn);

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
            } else if (item.status === 'ai_generated') {
                badgeClass = 'badge-ai';
                statusText = '✨ AI';
            }

            tdStatus.innerHTML = `<span class="badge ${badgeClass}">${statusText}</span>`;
            tr.append(tdLabel, tdValue, tdStatus);
            summaryTableBody.appendChild(tr);
        });
        summaryPanelContainer.classList.remove('hidden');
    }

    async function triggerSingleAIFill(fieldId, labelText, rowElement) {
        const aiBtn = rowElement.querySelector('.ai-regen-btn');
        const badge = rowElement.querySelector('.badge');
        const input = rowElement.querySelector('.edit-input');

        if (aiBtn) aiBtn.classList.add('spinning');
        showStatus(`Gemini is thinking about "${labelText}"...`, 'info');

        chrome.storage.local.get(['normalizedData', 'aiEnabled', 'geminiApiKey', 'activeTabId'], async (result) => {
            if (!result.normalizedData) {
                showStatus('Missing resume data.', 'error');
                if (aiBtn) aiBtn.classList.remove('spinning');
                return;
            }

            // Attempt to get page context from the active tab
            let pageContext = {};
            try {
                const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
                const currentTabId = tabs[0]?.id || result.activeTabId;
                if (currentTabId) {
                    pageContext = await new Promise(resolve => {
                        chrome.tabs.sendMessage(currentTabId, { action: "get_page_context" }, (response) => {
                            if (chrome.runtime.lastError) resolve({});
                            else resolve(response || {});
                        });
                    });
                }
            } catch (e) {
                console.error("SidePanel: Context fetch failed", e);
            }

            const prompt = `
                You are an AI assistant helping a job seeker fill out an application.
                Based on the following resume data, what is the best answer for the field labeled: "${labelText}"?

                JOB CONTEXT:
                - Company: ${pageContext.companyName || 'Unknown'}
                - Job/Page Title: ${pageContext.headerText || pageContext.pageTitle || 'Job Application'}
                - URL: ${pageContext.url || 'Unknown'}

                RESUME DATA (JSON):
                ${JSON.stringify(result.normalizedData, null, 2)}

                INSTRUCTIONS:
                - Provide ONLY the answer text. No conversational filler.
                - If it's a short answer (e.g. why do you want to work here), keep it professional and under 150 words.
                - If you cannot find a relevant answer, return "NOT_FOUND".
            `;

            chrome.runtime.sendMessage({ action: "generate_ai_answer", prompt: prompt }, (response) => {
                if (aiBtn) aiBtn.classList.remove('spinning');

                if (response && response.text && response.text.trim() !== "NOT_FOUND") {
                    input.value = response.text.trim();
                    badge.className = 'badge badge-ai';
                    badge.textContent = '✨ AI';
                    showStatus('Gemini suggested an answer!', 'success');
                } else {
                    const errorMsg = (response && response.error) ? response.error : "Gemini couldn't find an answer.";
                    showStatus(errorMsg, 'error');
                }
            });
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
        if (nextPageBtn) nextPageBtn.disabled = false;
    }

    function updatePreview(data) {
        if (!resumeContent) return;
        resumeContent.textContent = JSON.stringify({ _normalized: ResumeProcessor.normalize(data), _raw: data }, null, 2);
    }
});
