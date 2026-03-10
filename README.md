# 🚀 AutoFill Job Applications Extension

A powerful, intelligent Chrome Extension designed to fully automate the tedious process of filling out job applications. By leveraging the [JSON Resume](https://jsonresume.org/) standard, it maps your professional data to complex forms across dozens of Applicant Tracking Systems (ATS) with high precision.

---

## ✨ Key Features

- **⚡ 100% Automatic Execution**: No "Fill" button required. The extension detects supported application forms instantly via DOM monitors and MutationObservers, populating them as they render.
- **🎯 Intelligent Field Mapping**: Uses advanced matching algorithms (keywords, context, HTML attributes, and regex) to achieve high-accuracy data entry.
- **🖥️ Persistent Side Panel UI**: Monitor progress, review matches, and edit values in a dedicated Chrome Side Panel that won't disappear when you switch tabs.
- **📊 Interactive Fill Summary**: View a real-time table of all detected and filled fields. If a match needs adjustment, edit it in the side panel and click **Apply Edits** to update the webpage instantly.
- **🧠 Custom ATS Overrides**: Store persistent answers for common compliance, demographic, and site-specific questions (e.g., "Will you now or in the future require sponsorship?").
- **🛡️ Privacy First**: Your resume data is stored locally in your browser using Chrome's encrypted storage API. No data is sent to external servers unless you enable AI features.

---

## 🏗️ Supported ATS Platforms

w

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
- Click **Upload resume.json** and select your file.
- The extension will normalize and cache your data for instant use.

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

- [ ] **AI Integration**: Experimental support for local LLMs (Ollama) or OpenAI to handle open-ended short-form questions.
- [ ] **Cover Letter Generation**: One-click custom cover letters based on the Job Description.
- [ ] **Multi-Profile Support**: Switch between tailored resumes for different roles (e.g., "Fullstack" vs "DevOps").
- [ ] **Job Tracker Integration**: Automatically log applications to a spreadsheet or dashboard.

---

## 🤝 Contributing

Contributions are welcome! If you encounter an unsupported job board or a bug:
1. Fork the repo.
2. Create a new ATS strategy in `atsStrategies/`.
3. Register it in `strategyRegistry.js`.
4. Submit a Pull Request.

---

*Built for job seekers who value their time.*
