/**
 * leverStrategy.js
 * Strategy for Lever application forms.
 */
class LeverStrategy extends GenericStrategy {
    constructor() {
        super();
        this.CONFIDENCE_THRESHOLD = 65; // Slightly lower threshold for Lever
    }

    async execute(normalizedData, aiEnabled, resumeFile = null) {
        // console.log("Executing LeverStrategy (Human-like speed)...");
        await super.execute(normalizedData, aiEnabled, resumeFile);
        // console.log('Lever AutoFill complete!');
    }

    findValueForInput(input, normalizedData) {
        let match = this.findLeverSpecificMatch(input, normalizedData);
        if (match && match.value) return match;
        return super.findValueForInput(input, normalizedData);
    }

    findLeverSpecificMatch(input, data) {
        const nameAttr = (input.name || "").toLowerCase();

        // Lever commonly uses name attributes like 'name', 'email', 'phone', 'org'
        if (nameAttr === 'name') return { value: data.identity.full_name, confidence: 95 };
        if (nameAttr === 'email') return { value: data.contact.email, confidence: 95 };
        if (nameAttr === 'phone') return { value: data.contact.phone, confidence: 95 };
        if (nameAttr === 'org') return { value: data.employment.current_company, confidence: 90 };

        // URLs in lever are often formatted like urls[LinkedIn]
        if (nameAttr.includes('url')) {
            if (nameAttr.includes('linkedin')) return { value: data.contact.linkedin, confidence: 95 };
            if (nameAttr.includes('github')) return { value: data.contact.github, confidence: 95 };
            if (nameAttr.includes('portfolio')) return { value: data.contact.portfolio, confidence: 95 };
        }

        return null;
    }
}

// Register with Strategy Registry if available
if (typeof ATSStrategyRegistry !== 'undefined') {
    ATSStrategyRegistry.register(
        (url) => url.includes('lever.co'),
        LeverStrategy
    );
}
