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
        this.lastExecutedUrl = window.location.href;
        // console.log("Executing GreenhouseStrategy...");
        // console.log("  - Resume has:", {
            name: normalizedData.identity?.first_name,
            email: normalizedData.contact?.email,
            education: normalizedData.education?.length || 0,
            employment: normalizedData.employment?.history?.length || 0
        });

        // Check if this is a Greenhouse form by looking for key indicators
        const hasGreenhouseForm = !!document.querySelector('[id*="application-form"], [id*="job-application"], [class*="greenhouse"]');
        const inputFields = document.querySelectorAll('input, textarea, select');
        // console.log("  - Page has", inputFields.length, "input/textarea/select fields");
        // console.log("  - Greenhouse form detected:", hasGreenhouseForm);

        if (!hasGreenhouseForm && inputFields.length === 0) {
            console.warn("GreenhouseStrategy: No form elements detected on this page - might not be a job application page");
        }

        // Run base fill first (handles text inputs, textareas, native selects)
        // console.log("✓ Starting base fill (GenericStrategy)...");
        await super.execute(normalizedData, aiEnabled, resumeFile);

        // Then handle Greenhouse-specific custom components (Select2, country)
        // Slight delay to let Select2 initialize after base fill
        await this.sleep(300);
        // console.log("✓ Filling Greenhouse education dropdowns...");
        this._fillGreenhouseEducation(normalizedData);
        // console.log("✓ Filling country dropdown...");
        this._fillCountryDropdown(normalizedData);

        // console.log("✓ Greenhouse AutoFill complete.");
    }

    /* ===============================
       EDUCATION: Select2 DROPDOWNS
       Greenhouse uses jQuery Select2 for School, Degree, Discipline.
       The hidden <select> elements exist in the DOM but their UI is
       controlled entirely by Select2. We must use:
         1. The Select2 JS API: $(sel).val(...).trigger('change')
         2. Or simulate Select2's own option-click flow
    ================================== */

    _fillGreenhouseEducation(normalizedData) {
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

        blocks.forEach((block, idx) => {
            const edu = education[idx] || education[0];
            if (!edu) return;

            const institution = edu.institution || "";
            const degree = edu.studyType || edu.Discipline || edu.degree || "";
            const major = edu.area || "";

            // console.log(`GH: Education block ${idx}: institution="${institution}", degree="${degree}", major="${major}"`);

            // Fill each field in this block
            this._fillSelect2InBlock(block, ['school', 'institution', 'university', 'college'], institution);
            this._fillSelect2InBlock(block, ['degree', 'level_of_education', 'studytype'], degree);
            this._fillSelect2InBlock(block, ['discipline', 'major', 'field_of_study', 'area'], major);
        });
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
    _fillSelect2InBlock(block, keyFragments, value) {
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
                    }, 300);
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

    _fillCountryDropdown(normalizedData) {
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
                // Raw fallback
                sel.value = bestValue;
                this._triggerReactChange(sel, bestValue);
                // console.log(`GH: Country set via raw select = "${bestValue}"`);
                return;
            }
        }

        // console.log(`GH: No country dropdown found for "${country}" (may be a generic field or absent)`);
    }

    /**
     * Properly triggers React's change detection via the native setter trick.
     */
    _triggerReactChange(input, value) {
        const proto = input.tagName === 'TEXTAREA'
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
        if (labelTxt.includes("sponsorship") || labelTxt.includes("visa status") || labelTxt.includes("work authorization")) {
            return { value: identity.sponsorship_required, confidence: 90, fieldKey: "identity.sponsorship_required" };
        }

        if (labelTxt.includes("claude") || labelTxt.includes("cursor") || labelTxt.includes("ai tool")) {
            return { value: data.summary.ai_tool_experience, confidence: 90, fieldKey: "summary.ai_tool_experience" };
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
            !!doc.querySelector('#grnhse_app'),
        GreenhouseStrategy
    );
}
