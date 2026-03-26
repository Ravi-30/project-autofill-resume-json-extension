class GreenhouseStrategy extends GenericStrategy {
    constructor() {
        super();
        this.CONFIDENCE_THRESHOLD = 60;
        this.executed = false;
    }

    async execute(normalizedData, aiEnabled, resumeFile = null) {
        if (!normalizedData) {
            console.error("No resume data provided.");
            return;
        }

        this.aiEnabled = aiEnabled; // Store for inherited methods

        // Check if this is a Greenhouse form by looking for key indicators
        let hasGreenhouseForm = !!document.querySelector('[id*="application-form"], [id*="job-application"], [class*="greenhouse"], form[action*="greenhouse.io"]');
        let inputFields = document.querySelectorAll('input:not([type="hidden"]), textarea, select');

        if (!hasGreenhouseForm && inputFields.length === 0) {
            const formFound = await this._waitForForm();
            if (formFound) {
                hasGreenhouseForm = true;
                inputFields = document.querySelectorAll('input, textarea, select');
            }
        }

        // Execution Guard: If we already filled a form on this EXACT URL, skip.
        // We only trigger this guard if we actually found fields to fill.
        if (this.executed && window.location.href === this.lastExecutedUrl && inputFields.length > 0) {
            return;
        }

        // Logic flow:
        // 1. Run super.execute to handle "Apply" button clicking AND generic field filling
        await super.execute(normalizedData, aiEnabled, resumeFile);

        // 2. Refresh input detection after super.execute (in case "Apply" was clicked or form appeared)
        inputFields = document.querySelectorAll('input:not([type="hidden"]), textarea, select');

        if (inputFields.length > 0) {
            this.executed = true;
            this.lastExecutedUrl = window.location.href;

            await this.sleep(400);

            // 3. Run Greenhouse-specific refinements (Select2, Remix, etc.)
            await this._fillGreenhouseEducation(normalizedData);
            await this._fillCountryDropdown(normalizedData);
            await this._fillAllCustomSelects(normalizedData);
        } else {
            // If still no fields, don't set this.executed = true so we can try again on next mutation
        }
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
        if (!input || !value) return;

        try {
            // Click to open
            input.click();
            await this.sleep(300);

            // Search for options in the popover
            const options = Array.from(document.querySelectorAll('[role="option"], .select__option'));
            let bestOption = null;
            let highestConf = 0;

            options.forEach(opt => {
                const optText = (opt.innerText || "").toLowerCase();
                const normOpt = normalize(optText);
                
                if (normOpt === normValue) {
                    bestOption = opt;
                    highestConf = 100;
                } else if (normOpt.includes(normValue) || normValue.includes(normOpt)) {
                    if (highestConf < 80) {
                        bestOption = opt;
                        highestConf = 80;
                    }
                }
            });

            if (bestOption) {
                bestOption.click();
                await this.sleep(100);
            } else {
                // Fallback: just try to type in the input
                this.setInputValue(input, value);
                // Press Enter to confirm if it's a searchable combobox
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
        } catch (e) {
            // SILENT
        }
    }

    async _fillSelect2InBlock(block, keyFragments, value) {
        if (!value) return;
        const selects = Array.from((block === document ? document : block).querySelectorAll('select.select2-hidden-accessible, select[data-s2]'));

        for (const select of selects) {
            const container = select.closest('.field') || select.parentElement;
            const labelTxt = (container?.innerText || "").toLowerCase();
            const combined = (select.id || "") + " " + (select.name || "") + " " + labelTxt;

            if (keyFragments.some(k => combined.includes(k.toLowerCase()))) {
                // Use the refactored fuzzy matching from GenericStrategy
                this.setSelectValue(select, value);
                return;
            }
        }
    }

    async _fillCountryDropdown(normalizedData) {
        const country = normalizedData?.contact?.country || "";
        if (!country) return;
        
        // Greenhouse uses a standard select for country usually, but sometimes Select2
        await this._fillSelect2InBlock(document, ['country'], country);
        
        const countrySelect = document.querySelector('select[id*="country"], select[name*="country"]');
        if (countrySelect) {
            this.setSelectValue(countrySelect, country);
        }
    }

    async _fillAllCustomSelects(normalizedData) {
        // Find all Select2 and custom selects that haven't been filled
        const selects = document.querySelectorAll('select.select2-hidden-accessible');
        selects.forEach(select => {
            if (select.value && select.value !== "" && select.value !== "0") return;
            const match = this.findValueForInput(select, normalizedData);
            if (match && match.value) {
                this.setSelectValue(select, match.value);
            }
        });
    }
}

/* ===============================
   REGISTER STRATEGY
================================== */

if (typeof ATSStrategyRegistry !== "undefined") {
    ATSStrategyRegistry.register(
        (url, doc) => url.includes("greenhouse.io") ||
            url.includes("gh_jid=") || 
            !!doc.querySelector('meta[content*="greenhouse"]') ||
            !!doc.querySelector('.grnhse-wrapper') ||
            !!doc.querySelector('#grnhse_app') ||
            !!doc.querySelector('.application--form') ||
            !!doc.querySelector('form[action*="greenhouse.io"]'),
        GreenhouseStrategy
    );
}
