/**
 * adpStrategy.js
 * Strategy for Adp application forms.
 */
class AdpStrategy extends GenericStrategy {
    constructor() {
        super();
        this.CONFIDENCE_THRESHOLD = 70; 
    }

    async execute(normalizedData, aiEnabled, resumeFile = null) {
        // console.log("Executing AdpStrategy...");
        await super.execute(normalizedData, aiEnabled, resumeFile);
    }

    autoSubmit() {
        // ADP specific next/continue buttons
        const submitPatterns = ['next', 'continue', 'save & continue', 'save and continue', 'submit'];
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
        
        const submitButtons = allButtons.filter(btn => {
            if (btn.disabled || btn.offsetParent === null) return false;
            const text = (btn.innerText || btn.value || "").toLowerCase().trim();
            return submitPatterns.some(p => text.includes(p));
        });

        if (submitButtons.length > 0) {
            // Prefer "Next" or "Continue" as they are common in ADP's multi-step flow
            const btn = submitButtons.find(b => {
                const text = (b.innerText || b.value || "").toLowerCase().trim();
                return text.includes('next') || text.includes('continue');
            }) || submitButtons[0];

            btn.click();
            return true;
        }

        return super.autoSubmit();
    }

    findValueForInput(input, normalizedData) {
        const id = (input.id || "").toLowerCase();
        const name = (input.name || "").toLowerCase();
        const combined = id + " " + name;

        const identity = normalizedData.identity || {};
        const contact = normalizedData.contact || {};

        // ADP specific patterns (often uses prefixes like 'rb_' or specific container IDs)
        if (combined.includes('first_name') || id.includes('firstname')) return { value: identity.first_name, confidence: 95 };
        if (combined.includes('last_name') || id.includes('lastname')) return { value: identity.last_name, confidence: 95 };
        if (combined.includes('email')) return { value: contact.email, confidence: 95 };
        if (combined.includes('phone') || combined.includes('mobile')) return { value: contact.phone, confidence: 95 };
        if (combined.includes('address') && combined.includes('1')) return { value: contact.address, confidence: 95 };
        if (combined.includes('city')) return { value: contact.city, confidence: 95 };
        if (combined.includes('zip') || combined.includes('postal')) return { value: contact.zip_code, confidence: 95 };

        return super.findValueForInput(input, normalizedData);
    }
}

// Register with Strategy Registry
if (typeof ATSStrategyRegistry !== 'undefined') {
    ATSStrategyRegistry.register(
        (url, doc) => url.includes('adp.com'),
        AdpStrategy
    );
}
