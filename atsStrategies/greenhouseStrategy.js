class GreenhouseStrategy extends GenericStrategy {
    constructor() {
        super();
        this.CONFIDENCE_THRESHOLD = 60;
        this.executed = false;
    }

    async execute(normalizedData, aiEnabled, resumeFile = null) {
        // Allow re-execution for auto-apply queue (check if this is a new page load)
        if (this.executed && window.location.href === this.lastExecutedUrl) {
            // console.log("GreenhouseStrategy already executed on this URL. Skipping...");
            return;
        }

        if (!normalizedData) {
            console.error("No resume data provided.");
            return;
        }

        this.executed = true;
        this.aiEnabled = aiEnabled; // Store for inherited methods
        this.lastExecutedUrl = window.location.href;

        // Check if this is a Greenhouse form by looking for key indicators
        // New Greenhouse boards (job-boards.greenhouse.io) often render late in SPAs
        let hasGreenhouseForm = !!document.querySelector('[id*="application-form"], [id*="job-application"], [class*="greenhouse"], form[action*="greenhouse.io"]');
        let inputFields = document.querySelectorAll('input, textarea, select');

        if (!hasGreenhouseForm && inputFields.length === 0) {
            // console.log("GH: Form not found immediately. Waiting...");
            const formFound = await this._waitForForm();
            if (formFound) {
                hasGreenhouseForm = true;
                inputFields = document.querySelectorAll('input, textarea, select');
            } else {
                console.warn("GreenhouseStrategy: No form elements detected on this page - might not be a job application page");
            }
        }

        // Run base fill first (handles text inputs, textareas, native selects)
        // console.log("✓ Starting base fill (GenericStrategy)...");
        await super.execute(normalizedData, aiEnabled, resumeFile);

        // Then handle Greenhouse-specific custom components
        // Slight delay to let custom components initialize after base fill
        await this.sleep(400);

        // console.log("✓ Filling Greenhouse education dropdowns...");
        await this._fillGreenhouseEducation(normalizedData);
        // console.log("✓ Filling country dropdown...");
        await this._fillCountryDropdown(normalizedData);
        // console.log("✓ Filling other custom selects (demographics)...");
        await this._fillAllCustomSelects(normalizedData);

        // console.log("✓ Greenhouse AutoFill complete.");
    }

    async _waitForForm() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 15; // 15 * 200ms = 3s total
            const interval = setInterval(() => {
                const form = document.querySelector('[id*="application-form"], [id*="job-application"], form[action*="greenhouse.io"], .application--form');
                const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
                if (form || inputs.length > 5) {
                    clearInterval(interval);
                    resolve(true);
                }
                attempts++;
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 200);
        });
    }

    /* ===============================
       EDUCATION: Select2 DROPDOWNS
       Greenhouse uses jQuery Select2 for School, Degree, Discipline.
       The hidden <select> elements exist in the DOM but their UI is
       controlled entirely by Select2. We must use:
         1. The Select2 JS API: $(sel).val(...).trigger('change')
         2. Or simulate Select2's own option-click flow
    ================================== */

    async _fillGreenhouseEducation(normalizedData) {
        const education = normalizedData.education || [];
        if (!education.length) return;

        // console.log("GH: Filling education dropdowns...", education);

        // Greenhouse repeats education blocks — find all fieldsets
        // Greenhouse uses: <div id="education_0">, <div id="education_1">, etc.
        // or <fieldset class="education-fieldset">
        let blocks = Array.from(document.querySelectorAll(
            '[id^="education_"][id$="_fields"], ' +
            '[id^="education_0"], [id^="education_1"], ' +
            '.education-fieldset, ' +
            'fieldset.education'
        ));

        // Fallback: try to find blocks by proximity to "Education" heading
        if (blocks.length === 0) {
            const heading = Array.from(document.querySelectorAll('h2, h3, legend, .section-header')).find(el =>
                el.innerText?.toLowerCase().includes('education')
            );
            if (heading) {
                // Get the parent section
                const section = heading.closest('section, fieldset, div.section') || heading.parentElement;
                if (section) blocks = [section];
            }
        }

        // If still no blocks found, treat the whole document as one block
        if (blocks.length === 0) blocks = [document];

        blocks.forEach(async (block, idx) => {
            const edu = education[idx] || education[0];
            if (!edu) return;

            const institution = edu.institution || "";
            const degree = edu.studyType || edu.Discipline || edu.degree || "";
            const major = edu.area || "";

            // console.log(`GH: Education block ${idx}: institution="${institution}", degree="${degree}", major="${major}"`);

            // Fill each field in this block
            // Try legacy Select2 selectors first
            await this._fillSelect2InBlock(block, ['school', 'institution', 'university', 'college'], institution);
            await this._fillSelect2InBlock(block, ['degree', 'level_of_education', 'studytype'], degree);
            await this._fillSelect2InBlock(block, ['discipline', 'major', 'field_of_study', 'area'], major);

            // Then try Remix (job-boards.greenhouse.io) selects
            await this._fillRemixSelectInBlock(block, ['school', 'institution', 'university', 'college'], institution);
            await this._fillRemixSelectInBlock(block, ['degree', 'level_of_education', 'studytype'], degree);
            await this._fillRemixSelectInBlock(block, ['discipline', 'major', 'field_of_study', 'area'], major);
        });
    }

    /**
     * Fills a Remix-based select (job-boards.greenhouse.io) within a block.
     * These components use an <input role="combobox"> or similar and have
     * a nearby label. Clicking the input opens a list of options.
     */
    async _fillRemixSelectInBlock(block, keyFragments, value) {
        if (!value) return;

        const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const normValue = normalize(value);

        // Find inputs that look like Remix selects
        const inputs = Array.from((block === document ? document : block).querySelectorAll('input[role="combobox"], input.select__input'));

        for (const input of inputs) {
            const combined = normalize(
                (input.id || "") + " " +
                (input.name || "") + " " +
                (this.getLabelText(input) || "") + " " +
                (input.getAttribute('aria-label') || "")
            );

            if (!keyFragments.some(k => combined.includes(normalize(k)))) continue;

            // Found the right input. Click it to open the menu.
            await this._selectRemixOption(input, value, normalize, normValue);
            return;
        }
    }

    async _selectRemixOption(input, value, normalize, normValue) {
        // console.log(`GH: Remix Select - Attempting to select "${value}" for ${input.id}`);

        // 1. Click to focus/open
        input.click();
        input.focus();
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        // 2. Wait for options to appear
        await this.sleep(300);

        // Remix/React-Select often injects the list in a portal or nearby div
        // Look for items with classes like "select__option" or "remix-css" or "results"
        const options = Array.from(document.querySelectorAll(
            '[class*="select__option"], [class*="option"], [id*="react-select"], .remix-css-container div'
        )).filter(el => el.innerText && el.innerText.trim().length > 0);

        if (options.length === 0) {
            // console.warn("GH: No Remix options found in DOM after click.");
            return;
        }

        let bestOpt = null;
        let bestScore = 0;

        for (const opt of options) {
            const optNorm = normalize(opt.innerText || "");
            let score = 0;
            if (optNorm === normValue) score = 100;
            else if (optNorm.includes(normValue) || normValue.includes(optNorm)) score = 80;

            if (score > bestScore) {
                bestScore = score;
                bestOpt = opt;
            }
        }

        if (bestOpt && bestScore >= 60) {
            // console.log(`GH: Clicking Remix option: "${bestOpt.innerText}" (score ${bestScore})`);
            bestOpt.click();
            bestOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            bestOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        } else {
            // console.warn(`GH: No Remix match for "${value}" (best ${bestScore})`);
            // Try typing it if it's a searchable combobox?
            input.value = value;
            this._triggerReactChange(input, value);
        }
    }

    /**
     * Fills a Select2 dropdown within a given block by keyword matching.
     *
     * Greenhouse Select2 pattern:
     *   <select id="education_0_school" class="select2-hidden-accessible" ...>
     *     <option>Master's Degree</option>...
     *   </select>
     *   <span class="select2 select2-container">
     *     <span class="select2-selection">...</span>
     *   </span>
     *
     * Strategy:
     *   1. If jQuery + Select2 are available → use $(select).val(val).trigger('change')
     *   2. Otherwise → click the Select2 trigger, wait, then click the matching option
     *   3. Final fallback → setSelectValue on the raw <select>
     */
    async _fillSelect2InBlock(block, keyFragments, value) {
        if (!value) return;

        const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const normValue = normalize(value);

        // Find all <select> elements in this block
        const selects = Array.from((block === document ? document : block).querySelectorAll('select'));
        if (selects.length === 0) return; // Modern GH boards use <input>, handled by base GenericStrategy

        for (const sel of selects) {
            const combined = normalize(
                (sel.id || "") + " " +
                (sel.name || "") + " " +
                (this.getLabelText(sel) || "") + " " +
                (sel.getAttribute('aria-label') || "")
            );

            if (!keyFragments.some(k => combined.includes(normalize(k)))) continue;

            // console.log(`GH: Found select for [${keyFragments}]: id="${sel.id}", options=${sel.options.length}`);

            // --- Strategy 1: jQuery + Select2 API ---
            if (typeof window.$ !== 'undefined' && typeof window.$.fn.select2 !== 'undefined') {
                try {
                    // Find the best matching option
                    const bestIdx = this._findBestOption(sel, value, normalize, normValue);
                    if (bestIdx !== null) {
                        const bestValueString = sel.options[bestIdx].value;
                        window.$(sel).val(bestValueString).trigger('change');
                        // console.log(`GH: jQuery Select2 set [${keyFragments}] = "${bestValueString}"`);
                        return;
                    }
                } catch (e) {
                    console.warn("GH: jQuery Select2 approach failed:", e);
                }
            }

            // --- Strategy 2: Click the Select2 trigger span ---
            // The Select2 container is typically the next sibling of the hidden select
            const container = sel.nextElementSibling?.classList?.contains('select2')
                ? sel.nextElementSibling
                : document.querySelector(`.select2-container[data-select2-id="${sel.getAttribute('data-select2-id')}"]`)
                || document.querySelector(`.select2-container[aria-controls*="${sel.id}"]`);

            if (container) {
                const trigger = container.querySelector('.select2-selection');
                if (trigger) {
                    // Open dropdown
                    trigger.click();
                    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

                    await new Promise(resolve => {
                        setTimeout(() => {
                            // Find options in the opened dropdown
                            const opts = Array.from(document.querySelectorAll(
                                '.select2-results__option, .select2-results li'
                            ));

                            let bestOpt = null;
                            let bestScore = 0;
                            for (const opt of opts) {
                                const optNorm = normalize(opt.innerText || "");
                                let score = 0;
                                if (optNorm === normValue) score = 100;
                                else if (optNorm.startsWith(normValue) || normValue.startsWith(optNorm)) score = 80;
                                else if (optNorm.includes(normValue) || normValue.includes(optNorm)) score = 60;
                                if (score > bestScore) { bestScore = score; bestOpt = opt; }
                            }

                            if (bestOpt && bestScore >= 60) {
                                bestOpt.click();
                                // console.log(`GH: Select2 click-select [${keyFragments}] = "${bestOpt.innerText}"`);
                            } else {
                                console.warn(`GH: No matching option for "${value}" in Select2 (best ${bestScore})`);
                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                            }
                            resolve();
                        }, 300);
                    });
                    return;
                }
            }

            // --- Strategy 3: Raw <select> fallback ---
            const bestIdx = this._findBestOption(sel, value, normalize, normValue);
            if (bestIdx !== null) {
                sel.selectedIndex = parseInt(bestIdx);
                this._triggerReactChange(sel, sel.value);
                // console.log(`GH: Raw select fallback [${keyFragments}] = idx ${bestIdx}`);
            }
            return;
        }

        // console.log(`GH: No Select2 found for [${keyFragments}] with value "${value}" (may be a modern text input instead)`);
    }

    /**
     * Finds the best matching option INDEX in a <select> element.
     * Returns the integer index of the best match.
     * Returns null if no match found.
     */
    _findBestOption(select, value, normalize, normValue) {
        let bestIdx = -1;
        let bestScore = 0;

        const usVariations = this.getUSVariations();
        const isUS = usVariations.includes(normValue);

        for (let i = 0; i < select.options.length; i++) {
            const opt = select.options[i];
            const optText = normalize(opt.text || "");
            const optVal = normalize(opt.value || "");
            let score = 0;

            if (optText === normValue || optVal === normValue) score = 100;
            else if (isUS && (usVariations.includes(optText) || usVariations.includes(optVal))) score = 95;
            else if (optText.startsWith(normValue) || normValue.startsWith(optText)) score = 80;
            else if (optText.includes(normValue) || normValue.includes(optText)) score = 60;

            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }

        if (bestIdx !== -1 && bestScore >= 60) {
            return bestIdx; // Return integer index
        }
        return null;
    }

    /* ===============================
       COUNTRY DROPDOWN
       Greenhouse shows "Country" as a native <select> beside the phone field.
       The current issue was the value "United States +1" not matching any option.
       With the resume.json fix to "United States" this should now work via the
       generic strategy, but we add explicit Greenhouse handling as insurance.
    ================================== */

    async _fillCountryDropdown(normalizedData) {
        const country = normalizedData?.contact?.country || "";
        if (!country) return;

        const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const normCountry = normalize(country);

        // Find country selects
        const selects = Array.from(document.querySelectorAll('select')).filter(sel => {
            const combined = normalize(
                (sel.id || "") + " " + (sel.name || "") + " " + (this.getLabelText(sel) || "")
            );
            return combined.includes("country");
        });

        for (const sel of selects) {
            const bestIdx = this._findBestOption(sel, country, normalize, normCountry);
            if (bestIdx !== null) {
                const bestValue = sel.options[bestIdx].value;
                // Try jQuery + Select2 first
                if (typeof window.$ !== 'undefined' && typeof window.$.fn.select2 !== 'undefined') {
                    try {
                        window.$(sel).val(bestValue).trigger('change');
                        // console.log(`GH: Country set via jQuery Select2 = "${bestValue}"`);
                        return;
                    } catch (e) { /* fall through */ }
                }

                // Try Remix approach if legacy select2 failed
                const remixInput = document.querySelector(`input[aria-labelledby*="${sel.id}"], input#country`);
                if (remixInput) {
                    await this._selectRemixOption(remixInput, country, normalize, normCountry);
                    return;
                }

                // Raw fallback
                sel.value = bestValue;
                this._triggerReactChange(sel, bestValue);
                // console.log(`GH: Country set via raw select = "${bestValue}"`);
                return;
            }
        }

        // console.log(`GH: No country dropdown found for "${country}" (may be a generic field or absent)`);
    }

    /* ===============================
       OTHER CUSTOM SELECTS (Demographics, etc.)
    ================================== */
    async _fillAllCustomSelects(normalizedData) {
        // 1. Handle Legacy Select2 hidden selects
        const legacySelects = Array.from(document.querySelectorAll('select.select2-hidden-accessible, select[aria-hidden="true"]'));
        for (const sel of legacySelects) {
            if (sel.value && sel.value.trim() !== '') continue;

            const match = this.findValueForInput(sel, normalizedData);
            if (match && match.confidence >= this.CONFIDENCE_THRESHOLD && match.value) {
                const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                const normVal = normalize(match.value);
                const bestIdx = this._findBestOption(sel, match.value, normalize, normVal);

                if (bestIdx !== null) {
                    const bestValueString = sel.options[bestIdx].value;
                    if (typeof window.$ !== 'undefined' && typeof window.$.fn.select2 !== 'undefined') {
                        try {
                            window.$(sel).val(bestValueString).trigger('change');
                            continue;
                        } catch (e) { /* fall through */ }
                    }
                    sel.selectedIndex = parseInt(bestIdx);
                    this._triggerReactChange(sel, bestValueString);
                }
            }
        }

        // 2. Handle modern Remix comboboxes
        const remixInputs = Array.from(document.querySelectorAll('input[role="combobox"], input.select__input'));
        for (const input of remixInputs) {
            if (input.value && input.value.trim() !== '') continue;

            const match = this.findValueForInput(input, normalizedData);
            if (match && match.confidence >= this.CONFIDENCE_THRESHOLD && match.value) {
                const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                await this._selectRemixOption(input, match.value, normalize, normalize(match.value));
            }
        }
    }

    /**
     * Properly triggers React's change detection via the native setter trick.
     */
    _triggerReactChange(input, value) {
        const proto = input.tagName === 'SELECT'
            ? window.HTMLSelectElement.prototype
            : input.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;

        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
            nativeSetter.call(input, value);
        } else {
            input.value = value;
        }

        const tracker = input._valueTracker;
        if (tracker) tracker.setValue('');

        ['input', 'change', 'blur'].forEach(ev => {
            input.dispatchEvent(new Event(ev, { bubbles: true, composed: true }));
        });
    }

    /* ===============================
       OVERRIDDEN MATCHING LOGIC
    ================================== */

    findValueForInput(input, normalizedData) {
        let match = this.findGreenhouseSpecificMatch(input, normalizedData);
        if (!match || !match.value) {
            match = super.findValueForInput(input, normalizedData);
        }
        return match;
    }

    findGreenhouseSpecificMatch(input, data) {
        const id = (input.id || "").toLowerCase();
        const name = (input.name || "").toLowerCase();
        let labelTxt = "";

        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) labelTxt = label.innerText.toLowerCase();
        }

        if (!labelTxt) {
            const parent = input.closest("div") || input.parentElement;
            labelTxt = parent?.innerText?.toLowerCase() || "";
        }

        const identity = data?.identity || {};
        const contact = data?.contact || {};
        const summary = data?.summary || {};

        if (labelTxt.includes("how did you hear") || labelTxt.includes("how did you find out") || id.includes("how_did_you_hear"))
            return { value: "LinkedIn", confidence: 100, fieldKey: "summary.source" };

        if (labelTxt.includes("referral") || id.includes("referral"))
            return { value: " ", confidence: 100, fieldKey: "referral_blank" };

        if (id.includes("first_name") || name.includes("first_name"))
            return { value: identity.first_name, confidence: 100, fieldKey: "identity.first_name" };

        if (id.includes("last_name") || name.includes("last_name"))
            return { value: identity.last_name, confidence: 100, fieldKey: "identity.last_name" };

        if (id.includes("preferred_name") || name.includes("preferred_name") || labelTxt.includes("preferred first name") || labelTxt.includes("nickname"))
            return { value: identity.preferred_name, confidence: 100, fieldKey: "identity.preferred_name" };

        if (id.includes("email") || name.includes("email"))
            return { value: contact.email, confidence: 100, fieldKey: "contact.email" };

        if (id.includes("phone") || name.includes("phone"))
            return { value: contact.phone, confidence: 100, fieldKey: "contact.phone" };

        if (labelTxt.includes("linkedin") || id.includes("linkedin"))
            return { value: contact.linkedin, confidence: 100, fieldKey: "contact.linkedin" };

        if (labelTxt.includes("github") || labelTxt.includes("portfolio") || labelTxt.includes("website")) {
            const fieldKey = labelTxt.includes("github") ? "contact.github" : "contact.portfolio";
            const portfolio = contact.portfolio || contact.github;
            return { value: portfolio, confidence: 95, fieldKey };
        }

        // Custom Questions / Citizenship
        if (labelTxt.includes("sponsorship") || labelTxt.includes("visa status") || labelTxt.includes("require employment visa") || labelTxt.includes("commence") || labelTxt.includes("sponsor")) {
            return { value: identity.sponsorship_required || "No", confidence: 90, fieldKey: "identity.sponsorship_required" };
        }

        if (labelTxt.includes("work authorization") || labelTxt.includes("authorized to work")) {
            return { value: identity.authorized_to_work || "Yes", confidence: 90, fieldKey: "identity.authorized_to_work" };
        }

        // Explicit Demographics
        if (labelTxt.includes("race") || labelTxt.includes("ethnic")) {
            return { value: identity.ethnicity, confidence: 90, fieldKey: "identity.ethnicity" };
        }
        if (labelTxt.includes("sexual orientation")) {
            return { value: identity.sexual_orientation, confidence: 90, fieldKey: "identity.sexual_orientation" };
        }
        if (labelTxt.includes("transgender")) {
            return { value: identity.transgender_status, confidence: 90, fieldKey: "identity.transgender_status" };
        }
        if (labelTxt.includes("disability")) {
            return { value: identity.disability_status, confidence: 90, fieldKey: "identity.disability_status" };
        }

        if (labelTxt.includes("claude") || labelTxt.includes("cursor") || labelTxt.includes("ai tool")) {
            return { value: summary.ai_tool_experience, confidence: 90, fieldKey: "summary.ai_tool_experience" };
        }

        if (labelTxt.includes("restrict your ability to work") || labelTxt.includes("contractual obligations") || labelTxt.includes("non-compete")) {
            return { value: "No", confidence: 100, fieldKey: "custom.non_compete" };
        }

        if (labelTxt.includes("working in person") || labelTxt.includes("san francisco or new york office")) {
            return { value: "Yes", confidence: 100, fieldKey: "custom.in_office" };
        }

        return null;
    }
}

/* ===============================
   REGISTER STRATEGY
================================== */

if (typeof ATSStrategyRegistry !== "undefined") {
    ATSStrategyRegistry.register(
        (url, doc) => url.includes("greenhouse.io") ||
            !!doc.querySelector('meta[content*="greenhouse"]') ||
            !!doc.querySelector('.grnhse-wrapper') ||
            !!doc.querySelector('#grnhse_app') ||
            !!doc.querySelector('.application--form'),
        GreenhouseStrategy
    );
}
