/**
 * ashbyStrategy.js
 * Strategy for Ashby application forms.
 */
class AshbyStrategy extends GenericStrategy {
    constructor() {
        super();
        this.CONFIDENCE_THRESHOLD = 70;
    }

    async execute(normalizedData, aiEnabled, resumeFile = null) {
        // console.log("Executing AshbyStrategy...");
        await super.execute(normalizedData, aiEnabled, resumeFile);
    }

    findValueForInput(input, data) {
        const features = this.extractFeatures(input);
        const labelTxt = features.label_text.toLowerCase();

        // Demographic / Identity
        const identity = data?.identity || {};

        // 1. Demographic Fallbacks (Gender)
        if (labelTxt.includes("gender identity")) {
            return { value: identity.gender || "I prefer not to answer", confidence: 90, fieldKey: "identity.gender" };
        }

        // 2. Location Questions
        if (labelTxt.includes("country do you intend to work from")) {
            return { value: "USA", confidence: 100, fieldKey: "custom.work_country" };
        }

        // 3. AI Verification Questions (Common on Ashby)
        if (labelTxt.includes("accurately reflect your individual perspective") || labelTxt.includes("ensure that your individual voice")) {
            return {
                value: "Yes! The thought and care I put into my responses accurately reflects my voice and experience.",
                confidence: 100,
                fieldKey: "custom.ai_verification"
            };
        }

        // 4. Role-Specific/Case Volume Questions
        if (labelTxt.includes("how many cases do you solve") || (labelTxt.includes("volume") && labelTxt.includes("daily"))) {
            return {
                value: "I typically solve between 10 and 12 cases per day, which aligns with the high-quality, high-volume environment you described.",
                confidence: 100,
                fieldKey: "custom.case_volume"
            };
        }

        // Fallback to generic logic
        return super.findValueForInput(input, data);
    }

    // Override handleRadioCheckbox to support Ashby's selection lists
    handleRadioCheckbox(input, data) {
        const features = this.extractFeatures(input);
        const labelTxt = features.label_text.toLowerCase();

        // Handle Gender specifically since it's a common multi-choice on Ashby
        if (labelTxt.includes("gender identity")) {
            const identity = data?.identity || {};
            const gender = (identity.gender || "").toLowerCase();

            // Match the specific radio/checkbox labels
            const targetLabel = (document.querySelector(`label[for="${input.id}"]`)?.innerText || "").toLowerCase();
            if (gender && targetLabel.includes(gender)) {
                input.checked = true;
                this.setInputValue(input, null, 'green');
                return;
            }
        }

        super.handleRadioCheckbox(input, data);
    }
}

// Register with Strategy Registry
if (typeof ATSStrategyRegistry !== 'undefined') {
    ATSStrategyRegistry.register(
        (url, doc) => (url.includes('ashhq.by') || url.includes('ashbyhq.com') || url.includes('workboard')) &&
            !doc.querySelector('#grnhse_app'),
        AshbyStrategy
    );
}
