document.addEventListener('DOMContentLoaded', () => {
    const resumeInput = document.getElementById('resumeInput');
    const fillFormBtn = document.getElementById('fillFormBtn');
    const viewResumeBtn = document.getElementById('viewResumeBtn');
    const statusDiv = document.getElementById('status');
    const resumePreview = document.getElementById('resumePreview');
    const resumeContent = document.getElementById('resumeContent');

    // Summary Panel Elements
    const summaryPanelContainer = document.getElementById('summaryPanelContainer');
    const summaryTableBody = document.getElementById('summaryTableBody');
    const applyEditsBtn = document.getElementById('applyEditsBtn');

    // Custom Answers Elements
    const atsSelector = document.getElementById('atsSelector');
    const customAnswersInput = document.getElementById('customAnswersInput');
    const saveCustomAnswersBtn = document.getElementById('saveCustomAnswersBtn');

    // Keep track of the current tab ID logic executes on 
    let activeTabId = null;
    let customAtsAnswers = {
        Global: {},
        Greenhouse: {},
        Lever: {},
        Workday: {}
    };

    // Load existing resume and settings
    chrome.storage.local.get(['resumeData', 'aiEnabled', 'customAtsAnswers'], (result) => {
        if (result.resumeData) {
            showStatus('Resume loaded', 'success');
            enableButtons();
            updatePreview(result.resumeData);
        }
        if (result.aiEnabled) {
            document.getElementById('aiToggle').checked = true;
        }
        if (result.customAtsAnswers) {
            // Merge with local state to ensure all keys exist
            customAtsAnswers = { ...customAtsAnswers, ...result.customAtsAnswers };
        }
        // Initialize the textarea with the default view
        updateCustomAnswersTextarea();
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
        if (Object.keys(data).length === 0) {
            customAnswersInput.value = '';
        } else {
            customAnswersInput.value = JSON.stringify(data, null, 2);
        }
    }

    // Handle AI Toggle
    document.getElementById('aiToggle').addEventListener('change', (e) => {
        chrome.storage.local.set({ aiEnabled: e.target.checked });
    });

    // Handle File Upload
    resumeInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    const normalizedData = ResumeProcessor.normalize(json);

                    chrome.storage.local.set({
                        resumeData: json,
                        normalizedData: normalizedData
                    }, () => {
                        showStatus('Resume saved successfully!', 'success');
                        enableButtons();
                        updatePreview(json);
                    });
                } catch (error) {
                    showStatus('Error parsing JSON file.', 'error');
                    console.error(error);
                }
            };
            reader.readAsText(file);
        }
    });

    // Handle Resume File Upload (PDF/DOCX)
    const resumeFileInput = document.getElementById('resumeFileInput');
    const resumeFileName = document.getElementById('resumeFileName');

    // Load existing resume file name
    chrome.storage.local.get(['resumeFile'], (result) => {
        if (result.resumeFile && resumeFileName) {
            resumeFileName.textContent = `📎 ${result.resumeFile.name}`;
        }
    });

    if (resumeFileInput && resumeFileName) {
        resumeFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const resumeFileData = {
                        data: e.target.result, // base64 data
                        name: file.name,
                        type: file.type,
                        size: file.size
                    };

                    chrome.storage.local.set({ resumeFile: resumeFileData }, () => {
                        showStatus('Resume file uploaded!', 'success');
                        resumeFileName.textContent = `📎 ${file.name}`;
                    });
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Handle manual form fill (Fallback)
    fillFormBtn.addEventListener('click', () => {
        chrome.storage.local.get(['resumeData', 'aiEnabled'], (result) => {
            if (result.resumeData) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const normalizedData = ResumeProcessor.normalize(result.resumeData);
                    activeTabId = tabs[0].id; // Save tab ID for reporting
                    chrome.tabs.sendMessage(activeTabId, {
                        action: "fill_form",
                        data: result.resumeData,
                        normalizedData: normalizedData,
                        aiEnabled: result.aiEnabled || false,
                        manual: true
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            showStatus('Could not force fill. Try refreshing.', 'error');
                        } else {
                            showStatus('Form filling initiated!', 'success');
                        }
                    });
                });
            } else {
                showStatus('No resume data found.', 'error');
            }
        });
    });

    // Listen for fill reports from the content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'fill_report') {
            activeTabId = sender.tab.id;
            renderSummaryTable(request.report);
            sendResponse({ status: 'ok' });
        }
    });

    // Handle "Apply Edits" from the Side Panel
    applyEditsBtn.addEventListener('click', () => {
        const editedData = [];
        const rows = summaryTableBody.querySelectorAll('tr');

        rows.forEach(row => {
            const fieldId = row.dataset.fieldid;
            const input = row.querySelector('.edit-input');
            if (fieldId && input && input.value !== undefined) {
                editedData.push({ id: fieldId, value: input.value });
            }
        });

        if (activeTabId && editedData.length > 0) {
            chrome.tabs.sendMessage(activeTabId, {
                action: 'apply_edits',
                edits: editedData
            }, (response) => {
                showStatus('Edits applied successfully!', 'success');
            });
        }
    });

    function renderSummaryTable(reportData) {
        summaryTableBody.innerHTML = ''; // Clear previous

        if (!reportData || reportData.length === 0) {
            summaryPanelContainer.classList.add('hidden');
            return;
        }

        reportData.forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.fieldid = item.id;

            // Field Label cell
            const tdLabel = document.createElement('td');
            tdLabel.textContent = item.label.substring(0, 20) + (item.label.length > 20 ? '...' : '');
            tdLabel.title = item.label;

            // Edit Value cell
            const tdValue = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'edit-input';
            input.value = item.value || '';
            tdValue.appendChild(input);

            // Status Indicator cell
            const tdStatus = document.createElement('td');
            let statusBadge = '';

            if (item.status === 'filled') {
                statusBadge = `<span class="badge badge-green">${item.confidence}%</span>`;
            } else if (item.status === 'low_confidence') {
                statusBadge = `<span class="badge badge-yellow">${item.confidence}%</span>`;
            } else if (item.status === 'unmatched_required') {
                statusBadge = `<span class="badge badge-red">Missed</span>`;
            }

            tdStatus.innerHTML = statusBadge;

            tr.appendChild(tdLabel);
            tr.appendChild(tdValue);
            tr.appendChild(tdStatus);
            summaryTableBody.appendChild(tr);
        });

        summaryPanelContainer.classList.remove('hidden');
    }

    // Toggle Preview
    viewResumeBtn.addEventListener('click', () => {
        resumePreview.classList.toggle('hidden');
        viewResumeBtn.textContent = resumePreview.classList.contains('hidden')
            ? 'View Stored Data'
            : 'Hide Data';
    });

    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = `status-message status-${type}`;
        statusDiv.classList.remove('hidden');
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 3000);
    }

    function enableButtons() {
        fillFormBtn.disabled = false;
        viewResumeBtn.disabled = false;
    }

    function updatePreview(data) {
        const normalized = ResumeProcessor.normalize(data);
        resumeContent.textContent = JSON.stringify({
            _normalized: normalized,
            _raw: data
        }, null, 2);
    }
});
