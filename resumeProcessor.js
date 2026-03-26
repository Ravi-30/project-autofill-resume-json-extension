/**
 * Utility to process and normalize JSON Resume data into a flat, searchable index.
 */
class ResumeProcessor {
    /**
     * Text Normalization Utility
     * - Lowercases text
     * - Removes punctuation (replaces with space)
     * - Standardizes whitespace
     * - Expands abbreviations
     */
    static normalizeText(text) {
        if (!text || typeof text !== 'string') return '';

        let normalized = text.toLowerCase()
            .replace(/[^\w\s]|_/g, ' ') // Strip punctuation
            .replace(/\s+/g, ' ')       // Standardize whitespace
            .trim();

        // Abbreviation expansion dictionary
        const abbreviations = {
            "ml": "machine learning",
            "ai": "artificial intelligence",
            "js": "javascript",
            "ts": "typescript",
            "fe": "frontend",
            "be": "backend",
            "fs": "fullstack",
            "ux": "user experience",
            "ui": "user interface",
            "aws": "amazon web services",
            "gcp": "google cloud platform",
            "db": "database",
            "sdlc": "software development life cycle",
            "qa": "quality assurance"
        };

        // Split, expand, and rejoin
        return normalized.split(' ').map(word => abbreviations[word] || word).join(' ');
    }

    /**
     * Normalizes a JSON Resume into a structured internal index.
     */
    static normalize(resumeData) {
        if (!resumeData) return {};

        const basics = resumeData.basics || {};
        const work = resumeData.work || [];
        const skills = resumeData.skills || [];
        const location = basics.location || {};
        const profiles = basics.profiles || [];

        // 1. Identity
        const fullName = (basics.name || "").trim();
        const nameParts = fullName.split(/\s+/);
        let firstName = "", middleName = "", lastName = "";

        if (nameParts.length === 1) {
            firstName = nameParts[0];
        } else if (nameParts.length === 2) {
            firstName = nameParts[0];
            lastName = nameParts[1];
        } else if (nameParts.length > 2) {
            firstName = nameParts[0];
            lastName = nameParts[nameParts.length - 1];
            middleName = nameParts.slice(1, nameParts.length - 1).join(" ");
        }

        // Helper to find value by fuzzy key match
        const findByPattern = (obj, patterns) => {
            if (!obj) return "";
            const keys = Object.keys(obj);
            const foundKey = keys.find(k => patterns.some(p => k.toLowerCase().includes(p.toLowerCase())));
            return foundKey ? obj[foundKey] : "";
        };

        const preferredName = ""; // User requested to NOT fill preferred name

        const identity = {
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            preferred_name: preferredName,
            full_name: fullName,
            gender: basics.gender || "",
            pronouns: basics.pronouns || (basics.custom && basics.custom.pronouns) || "",
            veteran_status: basics.veteranStatus || "",
            disability_status: basics.disabilityStatus || "",
            ethnicity: basics.ethnicity || basics.race || (basics.demographics && (basics.demographics.ethnicity || basics.demographics.race)) || "",
            sponsorship_required: (basics.workAuthorization && basics.workAuthorization.requiresSponsorshipNowOrFuture) ||
                findByPattern(basics.workAuthorization, ["sponsorship"]),
            hispanic_latino: basics.hispanicLatino || (basics.demographics && basics.demographics.hispanicOrLatino) || ""
        };

        const availabilityVal = (basics.availability && basics.availability.soonestStartDate) ||
            findByPattern(basics.availability, ["soonest", "start date", "available"]);

        const availability = {
            start_date: availabilityVal
        };

        // 2. Contact & Links
        const getProfile = (network) => {
            const p = profiles.find(pf => this.normalizeText(pf.network).includes(network));
            return p ? p.url : "";
        };

        const contact = {
            email: basics.email || "",
            phone: basics.phone ? basics.phone.replace(/[^\d+]/g, "") : "", // Keep only digits and +
            linkedin: getProfile('linkedin'),
            github: getProfile('github'),
            portfolio: basics.url || "",

            // Location included in contact for convenience
            address: location.address || "",
            city: location.city || "",
            state: location.region || "",
            zip_code: location.postalCode || "",
            country: location.countryCode || "",
            location: (location.city && location.region) ? `${location.city}, ${location.region}` : (location.address || location.city || "")
        };

        // 3. Employment & Reverse Maps
        const workEntries = work.map(job => {
            const start = job.startDate ? new Date(job.startDate) : null;
            const end = job.endDate ? new Date(job.endDate) : new Date();
            let durationMonths = 0;

            if (start && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffTime = Math.abs(end - start);
                durationMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44));
            }

            return {
                ...job,
                durationMonths,
                normCompany: this.normalizeText(job.name),
                normTitle: this.normalizeText(job.position)
            };
        });

        let totalMonths = 0;
        const companyToDuration = {};
        const titleToDuration = {};
        const rolesByYear = {};

        workEntries.forEach(job => {
            totalMonths += job.durationMonths;
            companyToDuration[job.normCompany] = (companyToDuration[job.normCompany] || 0) + job.durationMonths;
            titleToDuration[job.normTitle] = (titleToDuration[job.normTitle] || 0) + job.durationMonths;

            if (job.startDate) {
                const startYear = new Date(job.startDate).getFullYear();
                const endYear = job.endDate ? new Date(job.endDate).getFullYear() : new Date().getFullYear();
                for (let y = startYear; y <= endYear; y++) {
                    if (!rolesByYear[y]) rolesByYear[y] = [];
                    if (!rolesByYear[y].includes(job.position)) {
                        rolesByYear[y].push(job.position);
                    }
                }
            }
        });

        const employment = {
            current_role: workEntries[0]?.position || basics.label || "",
            current_company: workEntries[0]?.name || "",
            years_total: Math.round(totalMonths / 12),
            roles_by_year: rolesByYear,
            history: workEntries
        };

        // 4. Skills & Reverse Maps
        const normalizedSkillSet = new Set();
        const skillFrequency = {};
        const skillToYears = {};
        const skillCategories = {};

        skills.forEach(skillCategory => {
            const catName = this.normalizeText(skillCategory.name);
            skillCategories[catName] = [];

            const keywords = skillCategory.keywords || [skillCategory.name];

            keywords.forEach(keyword => {
                const normKeyword = this.normalizeText(keyword);
                normalizedSkillSet.add(normKeyword);
                skillCategories[catName].push(normKeyword);

                skillFrequency[normKeyword] = (skillFrequency[normKeyword] || 0) + 1;
                skillToYears[normKeyword] = employment.years_total;
            });
        });

        const skillsData = {
            normalized_skill_set: Array.from(normalizedSkillSet),
            skill_frequency: skillFrequency,
            skill_categories: skillCategories,
            skills_string: Array.from(normalizedSkillSet).join(", ")
        };

        // Summaries
        const summaryLong = basics.summary || "";
        let summaryShort = "";
        if (summaryLong) {
            const firstSentence = summaryLong.split(/[.!?]/)[0];
            summaryShort = firstSentence ? firstSentence.trim() + "." : summaryLong;
        }

        const professionalStatement = findByPattern(basics, ["describe your relevant experiences", "industrial projects", "professional statement"]) ||
            findByPattern(basics.experience, ["describe your relevant experiences", "industrial projects", "highlight"]);

        const motivation = findByPattern(basics.experience, ["multiple roles", "motivation for each", "order them", "apply to multiple"]) || "";


        const onsiteSunnyvale = findByPattern(basics.custom, ["sunnyvale", "on-site", "work on-site"]);
        const aiToolExperience = findByPattern(basics.custom, ["claude", "cursor", "experience"]) ||
            findByPattern(basics.experience, ["claude", "cursor", "experience"]);

        // Output Index
        return {
            identity: identity,
            contact: contact,
            employment: employment,
            availability: availability,
            skills: skillsData,
            summary: {
                short: summaryShort,
                long: summaryLong,
                professional_statement: professionalStatement,
                motivation: motivation,
                onsite_sunnyvale: onsiteSunnyvale,
                ai_tool_experience: aiToolExperience
            },
            education: (resumeData.education || []).map(edu => ({
                ...edu,
                degree: edu.studyType || edu.Discipline || "",
                normInstitution: this.normalizeText(edu.institution),
                normDegree: this.normalizeText(edu.studyType || edu.Discipline || ""),
                normMajor: this.normalizeText(edu.area || "")
            })),
            education_flat: resumeData.education && resumeData.education[0] ? {
                institution: resumeData.education[0].institution || "",
                degree: resumeData.education[0].studyType || resumeData.education[0].Discipline || "",
                major: resumeData.education[0].area || "",
                start_date: resumeData.education[0].startDate || "",
                end_date: resumeData.education[0].endDate || ""
            } : {},
            reverse_maps: {
                skill_to_years: skillToYears,
                company_to_duration: companyToDuration,
                title_to_duration: titleToDuration
            }
        };

    }

    /**
     * Prunes normalized resume data to remove internal maps and noise for AI prompts.
     */
    static pruneForAi(normalizedData) {
        if (!normalizedData) return {};
        const pruned = JSON.parse(JSON.stringify(normalizedData));
        if (pruned.reverse_maps) delete pruned.reverse_maps;
        if (pruned.skills && pruned.skills.skill_frequency) delete pruned.skills.skill_frequency;
        if (pruned.skills && pruned.skills.skill_categories) delete pruned.skills.skill_categories;
        if (pruned.employment && pruned.employment.roles_by_year) delete pruned.employment.roles_by_year;
        if (pruned.employment && pruned.employment.history) {
            pruned.employment.history = pruned.employment.history.map(job => ({
                company: job.name || job.company,
                title: job.position || job.title,
                startDate: job.startDate,
                endDate: job.endDate || "Present",
                description: job.summary || job.description
            }));
        }
        if (pruned.education) {
            pruned.education = pruned.education.map(edu => ({
                institution: edu.institution,
                degree: edu.studyType || edu.degree,
                area: edu.area || edu.major,
                startDate: edu.startDate,
                endDate: edu.endDate
            }));
        }
        return pruned;
    }
}

// Export for use in extension (depending on environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResumeProcessor;
} else {
    const globalScope = typeof window !== 'undefined' ? window : self;
    globalScope.ResumeProcessor = ResumeProcessor;
}
