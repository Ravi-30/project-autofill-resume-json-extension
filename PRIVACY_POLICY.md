# Privacy Policy for Talent Direct Auto fill

**Last Updated: March 26, 2026**

## 1. Introduction
This extension is designed to help users automate the process of filling job application forms. We deeply value your privacy and are committed to protecting your personal data. Our architecture is built so that you maintain complete ownership of your data at all times.

## 2. Data Collection and Usage
- **Local Storage Only**: All profile data, including your uploaded resume JSON, normalized data, and application history, is strictly stored **locally** on your device using Chrome's secure `storage.local` API. We do not maintain any centralized databases of user resumes.
- **No Background Telemetry**: The extension does not silently collect analytics, telemetry, or transmit your browsing activity in the background. It only activates when matching job board URLs are detected.
- **No Third-Party AI Data Sharing**: All AI fallback integrations have been removed. Your resume data remains entirely on your local machine and is never sent to external AI processing APIs (such as OpenAI, Anthropic, or Google).

## 3. Permissions Justification
To securely provide intelligent auto-filling functionality, we request the following permissions:
- **`activeTab`**: Powers the "Force Fill Data" context menu on custom white-labeled ATS domains, allowing you to manually inject the script without requiring pervasive background access.
- **`storage`**: Used to save your resume profiles locally.
- **`host_permissions` (Specific ATS Domains)**: We strictly whitelist major Applicant Tracking Systems (e.g., Workday, Lever, Greenhouse) rather than requesting `<all_urls>`. This ensures our auto-fill scripts only execute on career pages, completely preserving your privacy when browsing other sites.
- **`sidePanel`**: Provides a convenient interface for managing your resume profiles and reviewing application histories.

## 4. Your Rights
Because your data is exclusively stored locally, you maintain complete and total control over it. You can permanently delete your data at any time by:
1. Deleting your profile via the extension's side panel.
2. Clearing the extension's local storage data in Chrome.
3. Simply uninstalling the extension.

## 5. Contact
For any questions or concerns regarding this policy or how your data is handled, please contact us through our Chrome Web Store support channel.
