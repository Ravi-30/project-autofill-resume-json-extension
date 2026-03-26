# 🚀 AutoFill Job Applications Extension

A powerful, intelligent Chrome Extension designed to fully automate the tedious process of filling out job applications. By leveraging the [JSON Resume](https://jsonresume.org/) standard, it maps your professional data to complex forms across dozens of Applicant Tracking Systems (ATS) with high precision.

---

## ✨ Key Features

- **🤖 AI-Powered Fallback**: Integrated Gemini 1.5 Flash to automatically solve required fields or open-ended questions that don't have a direct match in your resume JSON.
- **✉️ AI Cover Letter Generator**: Generate tailored cover letters instantly based on the job description and your resume. Copy them or auto-fill them into the application form with one click.
- **📊 Application History**: Automatically tracks every form you fill and submit, complete with timestamps, company names, and job roles.
- **🔒 Smart User-Lock System**: Your manual corrections are sacred. The extension detects when you physically type into a field and "locks" it, ensuring subsequent auto-fill passes never overwrite your manual edits.
- **🔘 Floating Control Widget**: A premium, draggable overlay that appears on every fill (manual or queue), giving you instant access to **Fill**, **Letter 🪄**, **Next**, and **Stop/Close** controls directly on the page.
- **⚡ 100% Automatic Execution**: No "Fill" button required. The extension detects supported forms instantly and populates them as they render.
- **🧪 Robust Data Sanitization**: The resume uploader now automatically strips illegal control characters from your JSON files, ensuring smooth imports from any source.

---

## 🏗️ Supported ATS Platforms

- **Greenhouse**
- **Lever**
- **Workday** (In progress/Stable)
- **Rippling**
- **Generic HTML Forms** (Heuristic matching)

---

## 🛠️ Installation

1. **Clone/Download**: Clone this repository or download the ZIP file and extract it.
2. **Extensions Page**: Open Google Chrome and navigate to `chrome://extensions/`.
3. **Developer Mode**: Toggle the **Developer mode** switch in the top-right corner.
4. **Load Unpacked**: Click **Load unpacked** and select the folder containing this project (the one with `manifest.json`).

---

## 📖 Getting Started

### 1. Prepare your `resume.json`
The extension uses an enhanced version of the [JSON Resume](https://jsonresume.org/schema/) schema. 
- Use the provided [sample_resume.json](file:///c:/Users/munna/OneDrive/Desktop/Autofill/project-autofill-resume-json-extension/sample_resume.json) as a template.
- Add your personal details, work history, education, and skills.
- **Pro Tip**: Use the `basics.custom` and `basics.availability` objects to map site-specific questions.

### 2. Upload and Sync
- Click the Extension icon 🧩 in your browser toolbar to open the **Side Panel**.
- (Optional) Enter your **Gemini API Key** in the settings section to enable AI-powered field solving.
- Click **Upload resume.json** and select your file. The extension will sanitize the text and cache it locally.

### 3. Start Applying
- Navigate to any supported job application page (e.g., a Greenhouse or Lever link).
- **Watch the magic happen**: Fields will be highlighted as they are filled:
    - 🟢 **Green**: High-confidence match (Auto-filled).
    - 🟡 **Yellow**: Low-confidence match (Prompts manual confirmation).
    - 🔴 **Red**: Required field that could not be matched.

### 4. Review & Edit
- Check the **Fill Summary** in the Side Panel to verify all answers.
- Click **Apply Edits** to push any manual changes from the side panel back to the form.

---

## 📂 Project Structure

- `atsStrategies/`: Modular classes for platform-specific automation logic.
- `content.js`: The heart of the extension; manages DOM injection and strategy routing.
- `resumeProcessor.js`: Normalizes complex JSON schemas into a flat, searchable index.
- `sidepanel.js/html/css`: The UI layer for user interaction and data review.
- `background.js`: Manages extension lifecycle and storage synchronization.

---

## 📦 Publishing to Chrome Web Store

To prepare the extension for the Chrome Web Store, use the provided packaging script to ensure a clean structure:

1. Open PowerShell in the project directory.
2. Run the packaging script:
   ```powershell
   .\package.ps1
   ```
3. Upload the generated `extension.zip` to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

The script ensures that:
- `manifest.json` is at the root of the zip.
- Development files like `node_modules`, `.git`, and test scripts are excluded.
- Only required assets (JS, HTML, CSS, icons, strategies) are included.

---

## 🔮 Roadmap

- [ ] **Cover Letter Generation**: One-click custom cover letters based on the Job Description.
- [ ] **Multi-Profile Support**: Switch between tailored resumes for different roles (e.g., "Fullstack" vs "DevOps").
- [ ] **Job Tracker 2.0**: Automatically log applications to a localized dashboard with status tracking.
- [ ] **Mobile Support**: Integration with Kiwi/Kiwi-Next browsers for automated mobile applications.

---

## 🤝 Contributing

Contributions are welcome! If you encounter an unsupported job board or a bug:
1. Fork the repo.
2. Create a new ATS strategy in `atsStrategies/`.
3. Register it in `strategyRegistry.js`.
4. Submit a Pull Request.

---

---

## 🔐 Permissions Justification

To provide a seamless experience across the vast landscape of Applicant Tracking Systems (ATS), this extension requires the following permissions:

- **`activeTab`**: Used only to interact with the job application form you are currently viewing. We do not access your data on other tabs.
- **`storage`**: Used to securely store your resume data locally on your device for autofilling.
- **`host_permissions` (`*://*/*`)**: Since job applications can be hosted on any domain (including company-specific subdomains), this permission is necessary to identify and fill forms regardless of where they are hosted.
- **`sidePanel`**: Provides a convenient interface for managing your resume data and triggering the autofill without obscuring the application form.

---

## 👥 Authors

- Sampath Velupula - *Lead Developer*
- Ravi Kumar Rayapalli - *ATS Strategy Specialist*
- Jafar vali - *Developer*
- Ramana gangarao - *Frontend Engineer*
- Bavish Kangari - *QA & Testing*
- jatin Thakur - *UX Designer*

---

*Built for job seekers who value their time.*
