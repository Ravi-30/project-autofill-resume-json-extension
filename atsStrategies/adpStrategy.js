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
        
        // Basic fallback execution. Override findValueForInput if specific DOM structures are known.
        await super.execute(normalizedData, aiEnabled, resumeFile);
    }
}

// Register with Strategy Registry
if (typeof ATSStrategyRegistry !== 'undefined') {
    ATSStrategyRegistry.register(
        (url, doc) => url.includes('adp.com'),
        AdpStrategy
    );
}
