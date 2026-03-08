/**
 * genericStrategy.js
 * Default strategy for applying resume data to standard job application forms.
 */
class GenericStrategy {
    constructor() {
        this.CONFIDENCE_THRESHOLD = 70;

        // Field Mapping Dictionary
        this.FIELD_MAPPING = {
            "identity.first_name": ["first_name", "first name", "fname", "given name"],
            "identity.middle_name": ["middle_name", "middle name", "m.i.", "middle initial"],
            "identity.last_name": ["last_name", "last name", "lname", "surname", "family name"],
            "identity.preferred_name": ["preferred_name", "preferred name", "preferred first name", "nickname"],
            "identity.full_name": ["name", "fullname", "full_name", "applicant name"],
            "identity.pronouns": ["pronouns", "preferred pronouns", "gender pronouns"],
            "contact.email": ["email", "e-mail", "mail", "email address"],
            "contact.phone": ["phone", "tel", "mobile", "cell", "contact", "phone number"],
            "contact.linkedin": ["linkedin", "linkedin url", "linkedin profile"],
            "contact.github": ["github", "github profile", "github url"],
            "contact.portfolio": ["website", "url", "portfolio", "link", "personal website"],
            "contact.address": ["address", "street", "address line 1"],
            "contact.city": ["city", "town"],
            "contact.zip_code": ["zip", "postal", "code", "zip code"],
            "contact.state": ["state", "province", "region"],
            "contact.country": ["country", "country format", "country/region", "location country"],
            "summary.short": ["summary", "about", "bio", "description"],
            "summary.professional_statement": ["describe your relevant experiences", "professional statement", "highlight your industrial projects", "research record", "relevant experiences", "industrial projects", "3-4 sentences", "highlight your projects", "highlight your industrial projects and research record"],
            "summary.motivation": ["multiple roles", "motivation for each", "order them", "apply to multiple roles", "explain your motivation"],
            "employment.current_role": ["job title", "current role", "current title", "position title", "role", "position"],
            "employment.current_company": ["company", "employer", "current company", "organization", "company name"],
            "employment.years_total": ["total years of experience", "total years experience", "number of years", "years of relevant experience"],
            "employment.work_description": ["responsibilities", "work description", "job description", "summary", "description", "work highlights"],
            "employment.start_date": ["work start", "employment start", "job start", "start date"],
            "employment.end_date": ["work end", "employment end", "job end", "end date"],
            // Dropdown specific / Additional fields
            "education_flat.degree": ["degree", "level of education", "educational attainment"],
            "education_flat.institution": ["school", "university", "college", "institution"],
            "education_flat.major": ["major", "field of study", "specialization", "discipline"],
            "education_flat.start_date": ["education start", "edu start", "graduation date", "education start date"],
            "education_flat.end_date": ["education end", "edu end", "graduation date", "education end date"],
            "identity.gender": ["gender", "sex"],
            "identity.ethnicity": ["ethnicity", "race"],
            "identity.hispanic_latino": ["hispanic", "latino", "hispanic or latino"],
            "identity.veteran_status": ["veteran", "military", "protected veteran"],
            "identity.disability_status": ["disability", "handicap", "voluntary self-identification"],
            "identity.sponsorship_required": ["sponsorship", "visa", "need sponsorship", "legal right to work", "require sponsorship for employment visa status", "require employment visa sponsorship", "now or will you in the future require"],
            "identity.authorized_to_work": ["authorized to work", "legally authorized", "work authorization", "authorized to work in the united states", "eligible to work", "legal right to work"],
            "identity.relocation_open": ["open to relocation", "willing to relocate", "relocate", "open to relocate"],
            "availability.start_date": ["start date", "availability", "soonest start", "available to start", "soonest", "soonest you can start"],
            "summary.onsite_sunnyvale": ["sunnyvale", "on-site", "work on-site", "sunnyvale office", "location", "sunnyvale, ca office"],
            "summary.ai_tool_experience": ["claude", "cursor", "ai tool", "claude code"],
            "identity.security_clearance_eligible": ["obtain and maintain", "government clearance", "security clearance", "u.s. government clearance", "requires u.s citizenship"]
        };
    }

    getUSVariations() {
        return ['us', 'usa', 'united states', 'united states of america', 'united states usa', 'us usa'];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getNestedValue(obj, path) {
        if (!obj || !path) return null;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    handleFileUpload(resumeFile) {
        if (!resumeFile || !resumeFile.data) return;

        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            const labelTxt = this.extractFeatures(input).label_text.toLowerCase();
            const containerTxt = input.closest('div, fieldset')?.innerText?.toLowerCase() || "";
            const combinedTxt = labelTxt + " " + containerTxt + " " + (input.name || "").toLowerCase() + " " + (input.id || "").toLowerCase();

            // Match resume keywords but EXCLUDE fields clearly marked for cover letters
            const resumeKeywords = ["resume", "cv", "curriculum", "attach", "upload", "file", "document", "application"];
            const isResumeField = resumeKeywords.some(kw => combinedTxt.includes(kw));
            const isCoverLetterField = combinedTxt.includes("cover");

            if (isResumeField && !isCoverLetterField) {
                // console.log("AutoFill: Attempting to attach resume to", input.name || input.id);

                try {
                    // Convert base64 Data URL to Blob
                    const byteString = atob(resumeFile.data.split(',')[1]);
                    const mimeString = resumeFile.data.split(',')[0].split(':')[1].split(';')[0];
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                    }
                    const blob = new Blob([ab], { type: mimeString });
                    const file = new File([blob], resumeFile.name, { type: mimeString });

                    // Use DataTransfer to simulate file selection
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    input.files = dataTransfer.files;

                    // Trigger events
                    ['change', 'input', 'blur'].forEach(ev => {
                        input.dispatchEvent(new Event(ev, { bubbles: true }));
                    });
                } catch (e) {
                    console.error("AutoFill: Error attaching file", e);
                }
            }
        });
    }

    handleInitialEntry() {
        const entryPatterns = [
            'apply', 'apply now', 'apply for this job', 'apply manually',
            'fill manually', 'enter manually', 'start application', 'start'
        ];

        const selectors = [
            'button:not([style*="display: none"])',
            'a.btn',
            'a[role="button"]',
            '[role="button"]',
            '[data-automation-id*="apply" i]',
            '[data-automation-id*="Apply"]',
            '[data-automation-id*="manual" i]',
            'input[type="submit"]'
        ];

        const buttons = Array.from(document.querySelectorAll(selectors.join(', ')));

        // Deduplicate buttons (in case they match multiple selectors)
        const uniqueButtons = Array.from(new Set(buttons));

        // Filter out hidden and disabled buttons, and sort by visibility
        const visibleButtons = uniqueButtons.filter(b => {
            return b.offsetParent !== null && !b.disabled;
        }).sort((a, b) => {
            // Prioritize buttons with higher z-index
            const getZIndex = (el) => parseInt(window.getComputedStyle(el).zIndex || 0, 10);
            return getZIndex(b) - getZIndex(a);
        });

        // console.log("AutoFill: handleInitialEntry found", visibleButtons.length, "visible buttons");

        // Find the best candidate for an entry button
        const entryBtn = visibleButtons.find(b => {
            const text = (b.innerText || b.value || b.getAttribute('aria-label') || b.textContent || "").toLowerCase().trim();
            const automationId = (b.getAttribute('data-automation-id') || "").toLowerCase();

            // Priority 1: Clear "Apply Manually" indicators (to skip popups)
            if (text.includes('apply manually') || text.includes('fill manually') || text.includes('enter manually')) {
                // console.log("AutoFill: Matched 'manual' pattern");
                return true;
            }
            if (automationId === 'applymanually' || automationId.includes('manual')) {
                // console.log("AutoFill: Matched automation ID 'manual' pattern");
                return true;
            }

            // Priority 2: Exact match for standard "Apply" buttons
            if (entryPatterns.some(p => text === p)) {
                // console.log("AutoFill: Matched exact text pattern:", text);
                return true;
            }

            // Priority 3: Partial match
            const matches = entryPatterns.some(p => text.includes(p));
            if (matches) {
                // console.log("AutoFill: Matched partial text pattern:", text);
            }
            return matches;
        });

        if (entryBtn) {
            // console.log("AutoFill: Automatically clicking entry/popup button:", entryBtn.innerText || entryBtn.value || entryBtn.getAttribute('aria-label'));
            // Ensure button is in view before clicking
            entryBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                // console.log("AutoFill: Executing click on entry button");
                entryBtn.click();
            }, 200);
            return true;
        }

        // console.log("AutoFill: No matching entry button found");
        return false;
    }

    async execute(normalizedData, aiEnabled, resumeFile = null) {
        // console.log("Executing GenericStrategy (Human-like speed)...");
        // console.log("=== RESUME DATA AVAILABLE ===");
        // console.log("  First Name:", normalizedData?.identity?.first_name);
        // console.log("  Last Name:", normalizedData?.identity?.last_name);
        // console.log("  Email:", normalizedData?.contact?.email);
        // console.log("  Phone:", normalizedData?.contact?.phone);
        // console.log("  Education entries:", normalizedData?.education?.length || 0);
        // console.log("  Employment entries:", normalizedData?.employment?.history?.length || 0);
        // console.log("============================");

        // --- Handle Initial Entry (Popups or Apply buttons) ---
        const entryClicked = this.handleInitialEntry();
        if (entryClicked) {
            // Give the DOM a moment to react if we clicked a popup
            await this.sleep(1000);
        }

        // --- Handle Resume Attachment ---
        if (resumeFile) {
            this.handleFileUpload(resumeFile);
        }

        // --- Handle Dynamic Entry Addition ---
        const handleAddButtons = () => {
            const sections = [
                {
                    data: normalizedData.employment?.history || [],
                    selectors: ['.work-entry', '.experience-entry', 'fieldset[id*="work"]', 'div[id*="work-experience"]'],
                    btnPatterns: ['Add Experience', 'Add Work', 'Add Another', 'Add Job']
                },
                {
                    data: normalizedData.education || [],
                    selectors: ['.education-entry', 'fieldset[id*="edu"]', 'div[id*="education"]'],
                    btnPatterns: ['Add Education', 'Add School', 'Add Another']
                }
            ];

            sections.forEach(section => {
                if (section.data.length <= 1) return;

                // Count existing containers
                let containerCount = 0;
                for (const sel of section.selectors) {
                    const found = document.querySelectorAll(sel).length;
                    if (found > containerCount) containerCount = found;
                }

                if (containerCount > 0 && containerCount < section.data.length) {
                    // Try to find the "Add" button
                    const buttons = Array.from(document.querySelectorAll('button, a, span.btn, .add-btn'));
                    const addBtn = buttons.find(b => {
                        const text = b.innerText || "";
                        return section.btnPatterns.some(p => text.toLowerCase().includes(p.toLowerCase()));
                    });

                    if (addBtn) {
                        // console.log(`AutoFill: Clicking "Add" button for count ${containerCount} < ${section.data.length}`);
                        addBtn.click();
                        // We click only once per execute cycle. 
                        // The MutationObserver in content.js will trigger execute() again if the DOM changes.
                    }
                }
            });
        };

        handleAddButtons();

        const inputs = document.querySelectorAll('input, textarea, select');
        // console.log("✓ Found", inputs.length, "form inputs on page");

        // Log first few inputs for debugging
        let fillCount = 0;
        // console.log("=== FORM INPUTS ON PAGE ===");
        Array.from(inputs).slice(0, 10).forEach((input, idx) => {
            const type = input.type || input.tagName;
            const name = input.name || input.id || '(unnamed)';
            const value = input.value?.substring(0, 30) || '(empty)';
            const hidden = input.getAttribute('type') === 'hidden' ? ' [HIDDEN]' : '';
            const disabled = input.disabled ? ' [DISABLED]' : '';
            // console.log(`  [${idx}] ${type} name="${name}" value="${value}"${hidden}${disabled}`);
        });
        // console.log("===========================");


        // This array will hold the report data for the side panel
        let fillReport = [];

        // Track field groups to avoid filling the same entry multiple times
        let educationGroupTracker = new Map();
        let employmentGroupTracker = new Map();

        for (const input of inputs) {
            // Allow hidden fields if they have a name or id (likely state holders for custom dropdowns)
            if (input.type === 'hidden' && !input.id && !input.name && !input.getAttribute('data-automation-id')) continue;
            if (input.disabled || input.readOnly) continue;

            // Skip inputs that are already filled — prevents re-triggering confidence popups
            // on second pass (e.g. from MutationObserver after initial fill)
            if (input.value && input.value.trim() !== '') continue;

            // Skip Select2-hidden selects — they are enhanced custom dropdowns whose visual
            // layer is controlled by Select2/jQuery. Setting their value directly won't update
            // the UI. Platform-specific strategies (e.g. GreenhouseStrategy) handle these.
            if (
                input.tagName === 'SELECT' &&
                (input.classList.contains('select2-hidden-accessible') ||
                    input.getAttribute('aria-hidden') === 'true' && input.style.display === 'none')
            ) continue;

            // Handle Radio/Checkbox
            if (input.type === 'radio' || input.type === 'checkbox') {
                this.handleRadioCheckbox(input, normalizedData);
                continue;
            }

            let match = this.findValueForInput(input, normalizedData);

            // SPECIAL CASE: If we matched 'middle_name' but value is empty, 
            // DO NOT let it fall back or re-match to 'full_name' later.
            if (match && match.fieldKey === 'identity.middle_name' && !match.value) {
                // This prevents the full_name fallback for middle name fields
                match = null;
                // However, we want to skip filling it with anything else
                continue;
            }

            // --- Multi-Entry Grouping Logic (Education & Employment) ---
            if (match && match.fieldKey) {
                const isEdu = match.fieldKey.startsWith('education_flat');
                const isEmp = match.fieldKey.startsWith('employment.');

                if (isEdu || isEmp) {
                    const sourceData = isEdu ? normalizedData.education : (normalizedData.employment?.history || []);

                    if (sourceData && sourceData.length > 0) {
                        const features = this.extractFeatures(input);
                        const context = (features.label_text + " " + features.nearby_text + " " + (input.name || "")).toLowerCase();
                        let bestIdx = -1;

                        // 1. Context Match
                        let highestScore = 0;
                        sourceData.forEach((item, index) => {
                            let score = 0;
                            const normVal = isEdu ? (item.normDegree + " " + item.normMajor) : (item.normCompany + " " + item.normTitle);
                            if (normVal && context.includes(normVal.toLowerCase())) score += 50;
                            if (item.startDate && context.includes(item.startDate.split('-')[0])) score += 20;

                            if (score > highestScore) {
                                highestScore = score;
                                bestIdx = index;
                            }
                        });

                        // 2. Name-based Index (e.g., degree_0, company_1)
                        if (bestIdx === -1) {
                            const indexMatch = (input.name || "").match(/\d+/);
                            if (indexMatch) {
                                const foundIdx = parseInt(indexMatch[0]);
                                if (foundIdx < sourceData.length) bestIdx = foundIdx;
                            }
                        }

                        // 3. Proximity Fallback
                        if (bestIdx === -1) {
                            const tracker = isEdu ? educationGroupTracker : employmentGroupTracker;
                            const selector = isEdu ? '.education-entry, fieldset, .school-entry' : '.work-entry, .experience-entry, fieldset, .employment-entry, .job-entry';
                            const container = input.closest(`${selector}, div[id*="edu"], div[id*="work"], div[id*="employment"], section[id*="experience"]`);

                            const containers = Array.from(document.querySelectorAll(selector));
                            let groupId = container ? containers.indexOf(container) : "global";
                            if (groupId === -1) groupId = "misc-" + (isEdu ? "edu" : "emp");

                            if (!tracker.has(groupId)) {
                                tracker.set(groupId, tracker.size % sourceData.length);
                            }
                            bestIdx = tracker.get(groupId);
                        }

                        if (bestIdx !== -1) {
                            const subKey = match.fieldKey.split('.')[1];
                            if (isEdu) {
                                const eduKeyMap = {
                                    'major': 'area',
                                    'start_date': 'startDate',
                                    'end_date': 'endDate'
                                };
                                const targetKey = eduKeyMap[subKey] || subKey;
                                match.value = sourceData[bestIdx][targetKey] ||
                                    sourceData[bestIdx][subKey] ||
                                    sourceData[bestIdx].degree ||
                                    sourceData[bestIdx].major ||
                                    "";
                            } else {
                                const empKeyMap = {
                                    'current_role': 'position',
                                    'current_company': 'name',
                                    'work_description': 'summary',
                                    'start_date': 'startDate',
                                    'end_date': 'endDate'
                                };
                                const targetKey = empKeyMap[subKey] || subKey;
                                // Expand lookup to common keys
                                match.value = sourceData[bestIdx][targetKey] ||
                                    sourceData[bestIdx][subKey] ||
                                    sourceData[bestIdx].company ||
                                    sourceData[bestIdx].title ||
                                    "";
                            }
                            match.confidence = 95;
                        }
                    }
                }



                let status = 'unmatched';
                let finalValue = '';

                if (match && match.value) {
                    // Silent skip: if confidence is too low, don't fill AND don't show a popup
                    const SILENT_SKIP_THRESHOLD = 40;
                    if (match.confidence < SILENT_SKIP_THRESHOLD) {
                        // Too low to be useful — ignore silently
                    } else if (match.confidence >= this.CONFIDENCE_THRESHOLD) {
                        // console.log(`  ✓ Filling: ${input.name || input.id || '?'} = "${match.value?.substring(0, 40)}..."`);
                        this.setInputValue(input, match.value, 'green');
                        status = 'filled';
                        finalValue = match.value;
                        fillCount++;
                    } else {
                        // console.log(`  ⚠ Low confidence (${match.confidence}%): ${input.name || input.id || '?'} = "${match.value?.substring(0, 40)}..."`);
                        this.promptUserConfirmation(input, match.value, match.confidence);
                        status = 'low_confidence';
                        finalValue = match.value; // It is suggested, though not explicitly set yet
                    }
                } else {
                    // Check if it's a required field that was missed
                    if (input.required || input.getAttribute('aria-required') === 'true') {
                        this.highlightUnmatchedRequired(input);
                        status = 'unmatched_required';
                    }
                }

                // Only add to report if it's an actionable or matched field
                if (status !== 'unmatched') {
                    const labelText = this.getLabelText(input) || input.name || input.id || input.placeholder || "Unknown Field";
                    fillReport.push({
                        id: input.id || input.name || Math.random().toString(36).substr(2, 9),
                        label: labelText,
                        value: finalValue,
                        confidence: match ? match.confidence : 0,
                        status: status
                    });
                }

                // --- Human-like Delay ---
                // Randomized delay between 200ms and 700ms to mimic typing/moving between fields
                if (status === 'filled') {
                    await this.sleep(Math.floor(Math.random() * 500) + 200);
                }
            }


            // Send the fill report to the sidepanel
            chrome.runtime.sendMessage({
                action: 'fill_report',
                report: fillReport
            });

        }
    }

    findCustomAnswer(input, hostname, customAtsAnswers) {
        if (!customAtsAnswers) return null;

        const features = this.extractFeatures(input);
        const combinedText = `${features.name_attr} ${features.id_attr} ${features.label_text} ${features.aria_label}`.toLowerCase();

        // Determine which ATS key we are currently under
        let atsKey = "Global";
        if (hostname.includes("greenhouse.io")) atsKey = "Greenhouse";
        else if (hostname.includes("lever.co")) atsKey = "Lever";
        else if (hostname.includes("workday.com") || hostname.includes("myworkdayjobs.com")) atsKey = "Workday";

        // Check platform specific answers first, then fallback to Global
        const answerSets = [customAtsAnswers[atsKey], customAtsAnswers["Global"]];

        for (const answers of answerSets) {
            if (answers && typeof answers === 'object') {
                // Iterate through keys defined by user
                for (const [questionKeyword, customValue] of Object.entries(answers)) {
                    if (combinedText.includes(questionKeyword.toLowerCase())) {
                        return { value: customValue, confidence: 100 };
                    }
                }
            }
        }
        return null;
    }

    extractFeatures(input) {
        return {
            name_attr: (input.name || "").toLowerCase(),
            id_attr: (input.id || "").toLowerCase(),
            placeholder: (input.placeholder || "").toLowerCase(),
            aria_label: (input.getAttribute('aria-label') || "").toLowerCase(),
            label_text: (this.getLabelText(input) || "").toLowerCase(),
            nearby_text: (this.getNearbyText(input) || "").toLowerCase(),
            input_type: (input.type || "text").toLowerCase(),
            normalized_combined: (typeof ResumeProcessor !== 'undefined') ?
                ResumeProcessor.normalizeText(
                    `${input.name || ""} ${input.id || ""} ${this.getLabelText(input)} ${input.getAttribute('aria-label') || ""}`
                ) : ""
        };
    }

    calculateConfidence(features, keywords, fieldKey) {
        let keywordScore = 0;
        const keywordWeights = {
            name_attr: 40,
            id_attr: 40,
            aria_label: 35,
            label_text: 60, // Increased from 35 to favor explicit questions
            placeholder: 25
        };

        let matchedPrimaryFeature = false;

        keywords.forEach(keyword => {
            const kw = keyword.toLowerCase();
            for (const [featureName, weight] of Object.entries(keywordWeights)) {
                const featureValue = features[featureName];
                if (featureValue && featureValue.includes(kw)) {
                    keywordScore += weight;
                    matchedPrimaryFeature = true;
                    if (featureValue === kw) {
                        keywordScore += weight * 0.5;
                    }
                }
            }
        });
        keywordScore = Math.min(keywordScore, 70);

        // Negative weight: if this is a Full Name attempt but field has "middle", penalize heavily
        if (fieldKey === "identity.full_name") {
            const combinedTxt = `${features.name_attr} ${features.id_attr} ${features.label_text}`.toLowerCase();
            if (combinedTxt.includes("middle")) {
                keywordScore -= 50;
            }
        }

        let contextScore = 0;
        keywords.forEach(keyword => {
            if (features.nearby_text && features.nearby_text.includes(keyword.toLowerCase())) {
                contextScore += 5;
            }
        });
        contextScore = Math.min(contextScore, 15);

        let typeScore = 0;
        const isEmailField = fieldKey === 'email';
        const isPhoneField = fieldKey === 'phone';
        const isUrlField = fieldKey.includes('url') || fieldKey.includes('linkedin') || fieldKey.includes('github') || fieldKey === 'website';

        if (isEmailField && features.input_type === 'email') typeScore = 15;
        else if (isPhoneField && features.input_type === 'tel') typeScore = 15;
        else if (isUrlField && features.input_type === 'url') typeScore = 15;
        else typeScore = 5;

        let confidence = keywordScore + contextScore + typeScore;

        if (!matchedPrimaryFeature) {
            confidence = Math.min(confidence, 30);
        }

        return Math.min(Math.round(confidence), 100);
    }

    findValueForInput(input, normalizedData) {
        const features = this.extractFeatures(input);

        // Debug logging for every field being checked
        const fieldName = input.name || input.id || '(unnamed)';
        const fieldLabel = this.getLabelText(input) || '(no label)';
        // console.log(`    [Checking] ${fieldName} | Label: "${fieldLabel}"`);

        // --- 1. Attempt Domain-Specific Dynamic Reverse Lookups ---
        // Guard: skip this if the label matches a professional statement question.
        // (The label may contain "experiences" which would falsely trigger the years lookup.)
        const PROFESSIONAL_STATEMENT_PHRASES = [
            "describe your relevant experiences",
            "industrial projects",
            "research record",
            "3-4 sentences",
            "highlight your",
            "professional statement"
        ];
        const isProfessionalStatementField = PROFESSIONAL_STATEMENT_PHRASES.some(phrase =>
            features.label_text.includes(phrase) ||
            features.nearby_text.includes(phrase) ||
            features.aria_label.includes(phrase)
        );

        const MOTIVATION_PHRASES = [
            "multiple roles",
            "motivation for each",
            "order them",
            "apply to multiple roles",
            "explain your motivation"
        ];
        const isMotivationField = MOTIVATION_PHRASES.some(phrase =>
            features.label_text.includes(phrase) ||
            features.nearby_text.includes(phrase) ||
            features.aria_label.includes(phrase)
        );

        if (!isProfessionalStatementField && (features.normalized_combined.includes("year") || features.normalized_combined.includes("experience"))) {
            if (normalizedData.reverse_maps) {
                // Check skills first
                for (const [skill, years] of Object.entries(normalizedData.reverse_maps.skill_to_years)) {
                    if (features.normalized_combined.includes(skill)) {
                        return { value: years.toString(), confidence: 95 };
                    }
                }
                // Check titles/companies
                for (const [company, months] of Object.entries(normalizedData.reverse_maps.company_to_duration)) {
                    if (features.normalized_combined.includes(company)) {
                        return { value: Math.round(months / 12).toString(), confidence: 90 };
                    }
                }
                for (const [title, months] of Object.entries(normalizedData.reverse_maps.title_to_duration)) {
                    if (features.normalized_combined.includes(title)) {
                        return { value: Math.round(months / 12).toString(), confidence: 90 };
                    }
                }
            }
        }

        // Fast-path: if this is clearly a professional statement field, return it directly
        if (isProfessionalStatementField && normalizedData.summary?.professional_statement) {
            // console.log(`      ✓ MATCHED (Professional Statement): "${normalizedData.summary.professional_statement.substring(0, 50)}..."`);
            return {
                value: normalizedData.summary.professional_statement,
                confidence: 100,
                fieldKey: 'summary.professional_statement'
            };
        }

        // Fast-path: if this is clearly a motivation/multiple-roles field, return it directly
        if (isMotivationField && normalizedData.summary?.motivation) {
            // console.log(`      ✓ MATCHED (Motivation): "${normalizedData.summary.motivation.substring(0, 50)}..."`);
            return {
                value: normalizedData.summary.motivation,
                confidence: 100,
                fieldKey: 'summary.motivation'
            };
        }

        // --- 2. Standard Heuristic Matching ---
        let bestMatch = { value: null, confidence: 0 };

        for (const [fieldKey, keywords] of Object.entries(this.FIELD_MAPPING)) {
            const confidence = this.calculateConfidence(features, keywords, fieldKey);

            if (confidence > bestMatch.confidence) {
                const value = this.getNestedValue(normalizedData, fieldKey);

                if (value) {
                    bestMatch = { value, confidence, fieldKey };
                    // console.log(`      → Candidate: ${fieldKey} (confidence: ${confidence}%) = "${String(value).substring(0, 40)}..."`);
                }
            }
        }

        if (bestMatch.confidence > 0) {
            // console.log(`      ✓ SELECTED: ${bestMatch.fieldKey} (${bestMatch.confidence}%)`);
            return bestMatch;
        } else {
            // --- Custom Hardcoded Fallbacks for High-Confidence Questions ---
            if (features.normalized_combined.includes("government clearance") ||
                (features.normalized_combined.includes("obtain") && features.normalized_combined.includes("maintain") && features.normalized_combined.includes("clearance"))) {
                // console.log(`      ✓ MATCHED (Hardcoded Security Clearance Fallback): "Yes"`);
                return { value: "Yes", confidence: 95, fieldKey: "identity.security_clearance_eligible" };
            }

            // Fallback for Authorized to Work (Default: Yes)
            if (features.normalized_combined.includes("authorized") && features.normalized_combined.includes("work")) {
                // console.log(`      ✓ MATCHED (Hardcoded Authorized to Work Fallback): "Yes"`);
                return { value: "Yes", confidence: 90, fieldKey: "identity.authorized_to_work" };
            }

            // Fallback for Sponsorship (Default: No)
            if (features.normalized_combined.includes("sponsorship") || features.normalized_combined.includes("visa")) {
                // console.log(`      ✓ MATCHED (Hardcoded Sponsorship Fallback): "No"`);
                return { value: "No", confidence: 90, fieldKey: "identity.sponsorship_required" };
            }

            // Fallback for Relocation (Default: Yes)
            if (features.normalized_combined.includes("relocation") || features.normalized_combined.includes("relocate")) {
                // console.log(`      ✓ MATCHED (Hardcoded Relocation Fallback): "Yes"`);
                return { value: "Yes", confidence: 85, fieldKey: "identity.relocation_open" };
            }

            // console.log(`      ✗ NO MATCH FOUND`);
            return null;
        }
    }

    /**
     * Handle Radio and Checkbox inputs
     */
    handleRadioCheckbox(input, normalizedData) {
        const match = this.findValueForInput(input, normalizedData);
        if (!match || !match.value) return;

        const val = String(match.value).toLowerCase();
        const labelText = (this.getLabelText(input) || "").toLowerCase();

        if (input.type === 'radio') {
            // If the label matches the value, or common synonyms
            const isPositiveMatch =
                labelText.includes(val) ||
                (val === 'yes' && (labelText === 'yes' || labelText === 'y')) ||
                (val === 'no' && (labelText === 'no' || labelText === 'n')) ||
                (val === 'male' && labelText === 'male') ||
                (val === 'female' && labelText === 'female') ||
                (val === 'non-binary' && labelText.includes('non-binary')) ||
                ((val === 'no' || val === 'not_a_veteran') && (labelText.includes('not a protected veteran') || labelText.includes('no, i am not'))) ||
                ((val === 'no' || val === 'no_disability') && (labelText.includes('no, i do not have a disability') || labelText.includes('no, i don\'t'))) ||
                (val.includes('he/him') && labelText.includes('he/him')) ||
                (val.includes('she/her') && labelText.includes('she/her'));

            if (isPositiveMatch) {
                input.checked = true;
                this.setInputValue(input, null, 'green'); // Visual feedback
            }
        } else if (input.type === 'checkbox') {
            if (val === 'yes' || val === 'true' || val === '1') {
                input.checked = true;
                this.setInputValue(input, null, 'green');
            }
        }
    }

    getLabelText(input) {
        if (!input) return '';
        if (input.parentElement && input.parentElement.tagName === 'LABEL') {
            return input.parentElement.innerText;
        }
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) return label.innerText;
        }
        const labeledBy = input.getAttribute('aria-labelledby');
        if (labeledBy) {
            const labelElement = document.getElementById(labeledBy);
            if (labelElement) return labelElement.innerText;
        }
        return '';
    }

    getNearbyText(input) {
        if (!input) return '';
        let container = input.parentElement;
        let iterations = 0;
        while (container && iterations < 2) {
            const text = container.innerText || "";
            if (text.length > 0 && text.length < 200) {
                return text;
            }
            container = container.parentElement;
            iterations++;
        }
        return '';
    }

    setInputValue(input, value, highlightType = 'green') {
        if (!input || (!value && highlightType !== 'red')) return;

        if (value) {
            if (input.tagName === 'SELECT') {
                this.setSelectValue(input, value);
            } else {
                // Use the native setter to bypass React's value interception,
                // then dispatch a synthetic input event so React's onChange fires.
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                )?.set;
                const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                )?.set;

                if (input.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                    nativeTextAreaValueSetter.call(input, value);
                } else if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(input, value);
                } else {
                    input.value = value;
                }
            }

            // Dispatch events to satisfy React (needs bubbles:true + composed:true for shadow DOM)
            ['input', 'change', 'blur'].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true, composed: true });
                input.dispatchEvent(event);
            });

            // Also try the React _valueTracker approach as a belt-and-suspenders
            const tracker = input._valueTracker;
            if (tracker) {
                tracker.setValue(''); // Trick React into thinking value changed
            }
            // Re-dispatch input after tracker reset
            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }

        const originalBg = input.style.backgroundColor;
        const originalBorder = input.style.border;

        if (highlightType === 'green') {
            input.style.backgroundColor = "#dcfce7"; // green-100
            input.style.border = "2px solid #22c55e"; // green-500
        } else if (highlightType === 'red') {
            input.style.backgroundColor = "#fee2e2"; // red-100
            input.style.border = "2px solid #ef4444"; // red-500
        }

        // Revert green highlighting after 3 seconds
        if (highlightType === 'green') {
            setTimeout(() => {
                input.style.backgroundColor = originalBg;
                input.style.border = originalBorder;
            }, 3000);
        }
    }

    /**
     * Set value for a SELECT element using fuzzy matching on options
     */
    setSelectValue(select, value) {
        if (!select || !value) return;

        const normalize = (s) => String(s).toLowerCase().replace(/[^\w\s]/g, '').trim();
        const val = normalize(value);

        // --- US Variation Equivalence ---
        const usVariations = this.getUSVariations();
        const isUSValue = usVariations.includes(val);

        let bestOptionIndex = -1;
        let highestConfidence = 0;

        for (let i = 0; i < select.options.length; i++) {
            const option = select.options[i];
            const optText = normalize(option.text);
            const optVal = normalize(option.value);

            // 1. Perfect match (100)
            if (optVal === val || optText === val) {
                bestOptionIndex = i;
                highestConfidence = 100;
                break;
            }

            // 2. Compliance Equivalence (e.g., "no" matches "I don't have a disability")
            if (val === 'no' && (optText.includes("not a protected veteran") || optText.includes("do not have a disability") || optText === 'no' || optText === 'n')) {
                if (98 > highestConfidence) { bestOptionIndex = i; highestConfidence = 98; }
            }
            if (val === 'yes' && (optText === 'yes' || optText === 'y' || optText === 'true' || optText.includes("i am a protected veteran"))) {
                if (98 > highestConfidence) { bestOptionIndex = i; highestConfidence = 98; }
            }
            if ((val === 'male' || val === 'female') && optText === val) {
                if (99 > highestConfidence) { bestOptionIndex = i; highestConfidence = 99; }
            }

            // 3. US Variation Equivalence (95)
            if (isUSValue && (usVariations.includes(optVal) || usVariations.includes(optText))) {
                if (95 > highestConfidence) {
                    bestOptionIndex = i;
                    highestConfidence = 95;
                }
            }

            // 3. Dialing Code Matching (92)
            // If the value is "United States" and option contains "+1", or vice versa
            if (isUSValue && (optText.includes('1') || optVal.includes('1')) && (optText.includes('+') || optVal.includes('+'))) {
                if (92 > highestConfidence) {
                    bestOptionIndex = i;
                    highestConfidence = 92;
                }
            }

            // 4. Starts with (90)
            if (optText.startsWith(val) || val.startsWith(optText)) {
                if (90 > highestConfidence) {
                    bestOptionIndex = i;
                    highestConfidence = 90;
                }
            }
            // 5. Includes (70)
            else if (optText.includes(val) || val.includes(optText)) {
                if (70 > highestConfidence) {
                    bestOptionIndex = i;
                    highestConfidence = 70;
                }
            }
        }

        if (bestOptionIndex !== -1) {
            select.selectedIndex = bestOptionIndex;
            // Trigger events
            ['change', 'input', 'blur'].forEach(ev => {
                select.dispatchEvent(new Event(ev, { bubbles: true }));
            });
        } else {
            // Fallback: try setting value directly
            select.value = value;
        }
    }

    highlightUnmatchedRequired(input) {
        this.setInputValue(input, null, 'red');
    }

    promptUserConfirmation(input, suggestion, confidence) {
        const originalBorder = input.style.border;
        const originalBackground = input.style.backgroundColor;

        input.style.border = "2px solid #f59e0b";
        input.style.backgroundColor = "#fffbeb";

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.zIndex = '999999';
        container.style.backgroundColor = '#ffffff';
        container.style.border = '1px solid #d1d5db';
        container.style.borderRadius = '4px';
        container.style.padding = '8px';
        container.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '4px';
        container.style.fontSize = '12px';
        container.style.fontFamily = 'system-ui, sans-serif';
        container.style.color = '#374151';

        const info = document.createElement('div');
        info.innerHTML = `<strong>Suggested:</strong> ${suggestion}<br/><span style="color: #6b7280; font-size: 10px;">Confidence: ${confidence}%</span>`;

        const buttonRow = document.createElement('div');
        buttonRow.style.display = 'flex';
        buttonRow.style.gap = '4px';
        buttonRow.style.marginTop = '4px';

        const acceptBtn = document.createElement('button');
        acceptBtn.innerHTML = '✓ Accept';
        acceptBtn.style.padding = '2px 8px';
        acceptBtn.style.backgroundColor = '#10b981';
        acceptBtn.style.color = 'white';
        acceptBtn.style.border = 'none';
        acceptBtn.style.borderRadius = '2px';
        acceptBtn.style.cursor = 'pointer';

        const rejectBtn = document.createElement('button');
        rejectBtn.innerHTML = '✗ Reject';
        rejectBtn.style.padding = '2px 8px';
        rejectBtn.style.backgroundColor = '#ef4444';
        rejectBtn.style.color = 'white';
        rejectBtn.style.border = 'none';
        rejectBtn.style.borderRadius = '2px';
        rejectBtn.style.cursor = 'pointer';

        buttonRow.appendChild(acceptBtn);
        buttonRow.appendChild(rejectBtn);
        container.appendChild(info);
        container.appendChild(buttonRow);

        const rect = input.getBoundingClientRect();
        container.style.top = `${window.scrollY + rect.bottom + 4}px`;
        container.style.left = `${window.scrollX + rect.left}px`;

        document.body.appendChild(container);

        const cleanup = () => {
            container.remove();
            input.style.border = originalBorder;
            input.style.backgroundColor = originalBackground;
        };

        acceptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.setInputValue(input, suggestion);
            cleanup();
        });

        rejectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            cleanup();
        });
    }

    /**
     * Attempts to automatically submit the form by finding and clicking a Submit/Next button.
     */
    autoSubmit() {
        // Prioritize buttons that clearly indicate submission/progression
        // Start with "Next" and "Continue" which are less ambiguous than "Apply"
        const submitPatterns = [
            'submit application', 'submit', 'send application', 'finish',
            'next', 'continue', 'save and continue', 'next step', 'go to next step',
            'apply now', 'apply', 'apply for'
        ];

        // Look for typical submit buttons
        const buttons = Array.from(document.querySelectorAll('button[type="submit"], button, input[type="submit"], a.btn, a[role="button"], span.btn, .button, .btn'));

        // Filter and sort: prioritize buttons that are clearly submission buttons
        const eligibleButtons = buttons.filter(btn => {
            // Skip visually hidden or disabled buttons
            if (btn.disabled || btn.offsetParent === null) return false;

            const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || "").toLowerCase().trim();

            // Skip empty buttons
            if (!text) return false;

            // Skip very short buttons (likely icons or minor controls)
            if (text.length < 2) return false;

            // Match against submit patterns
            return submitPatterns.some(p => text === p || text.startsWith(p));
        });

        // Prioritize by pattern strength
        eligibleButtons.sort((a, b) => {
            const textA = (a.innerText || a.value || a.getAttribute('aria-label') || "").toLowerCase().trim();
            const textB = (b.innerText || b.value || b.getAttribute('aria-label') || "").toLowerCase().trim();

            // Score buttons based on how specific their text is
            const score = (text) => {
                if (text === 'submit application') return 100;
                if (text === 'submit') return 95;
                if (text === 'send application') return 92;
                if (text === 'finish') return 90;
                if (text === 'next') return 80;
                if (text === 'continue') return 75;
                if (text === 'save and continue') return 72;
                if (text === 'next step') return 70;
                if (text.includes('apply') && text.includes('now')) return 60;
                if (text.includes('apply') && text.includes('for')) return 55;
                return 0;
            };

            // Boost buttons with type="submit"
            let scoreA = score(textA);
            let scoreB = score(textB);

            if (a.getAttribute('type') === 'submit') scoreA += 10;
            if (b.getAttribute('type') === 'submit') scoreB += 10;

            return scoreB - scoreA;
        });

        if (eligibleButtons.length > 0) {
            const btn = eligibleButtons[0];
            const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || "").toLowerCase().trim();
            // console.log(`AutoFill: Found auto-submit button: "${text}" (score-based selection)`);

            // Fast-track: Some forms have a required consent checkbox right before submission that was missed
            const requiredCheckboxes = document.querySelectorAll('input[type="checkbox"][required], input[type="checkbox"][aria-required="true"]');
            requiredCheckboxes.forEach(cb => {
                if (!cb.checked) {
                    // console.log("AutoFill: Auto-checking missed required checkbox before submit");
                    cb.checked = true;
                    ['change', 'input', 'click'].forEach(e => cb.dispatchEvent(new Event(e, { bubbles: true })));
                }
            });

            // Score the text to see if we believe this was a final SUBMIT button
            const finalScore = score(text);

            // Execute the click
            btn.click();

            // Return true if it was likely a final submission (score >= 90)
            return finalScore >= 90;
        }

        // console.log("AutoFill: Could not find a clear submit button.");
        return false;
    }
}


// Global exposure
if (typeof window !== 'undefined') {
    window.GenericStrategy = GenericStrategy;
}

