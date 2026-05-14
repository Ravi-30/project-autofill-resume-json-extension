# 🚀 TalentScreen Autofill

![Version](https://img.shields.io/badge/version-1.6-blue.svg)
![Platform](https://img.shields.io/badge/platform-Chrome-orange.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**TalentScreen Autofill** is a premium Chrome Extension designed to streamline the job application process. By leveraging the [JSON Resume](https://jsonresume.org/) standard and advanced PDF processing, it allows job seekers to populate complex application forms across dozens of Applicant Tracking Systems (ATS) with a single click.

---

## ✨ Key Features

- **🎯 Manual Trigger Control**: Total control over when to autofill. Use the dedicated **Autofill** button in the side panel to populate forms only when you're ready.
- **📁 Dual Resume Support**: Upload your professional data via a standardized **JSON** file or a traditional **PDF** resume.
- **🛠️ Integrated Data Manager**: View, edit, and refine your resume data directly within the extension's **Manage Data** tab.
- **📊 Application History**: Automatically tracks every application you fill, providing a chronological log of company names, roles, and submission timestamps.
- **🔒 Smart User-Lock System**: Your manual edits are protected. The extension detects manual input and "locks" those fields to prevent them from being overwritten during subsequent fill attempts.
- **✅ Automatic Validation**: Built-in validation ensures your resume data contains all critical fields (contact info, work history, etc.) before you start applying.
- **🎨 Modern Side Panel UI**: A sleek, tabbed interface organized into **Controls**, **History**, and **Manage Data** for a clutter-free experience.

---

## 🏗️ Supported ATS Platforms

TalentScreen Autofill provides robust support for major Applicant Tracking Systems, including:

| | | |
|---|---|---|
| 🟢 Greenhouse | 🔵 Workday | 🟠 Lever |
| 🟡 SmartRecruiters | 🟣 iCIMS | 🟢 Indeed |
| 🔵 LinkedIn | 🟠 BambooHR | 🟡 Jobvite |
| 🟣 ADP | 🟢 Ashby | 🔵 Oracle Cloud |
| 🟠 Taleo | 🟡 SuccessFactors | 🟣 Personio |
| ... and many more! | | |

*Also includes **Generic HTML Support** for heuristic matching on custom job boards.*

---

## 🛠️ Installation

1. **Download**: Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/autofill-job-applications/bebdlhhpgmegdebdballinfmfnlpmeio).
2. **Pin Extension**: Click the 🧩 icon and pin **TalentScreen Autofill** to your toolbar.
3. **Open Side Panel**: Right-click the extension icon or click the icon to open the side panel interface.

---

## 📖 Getting Started

### 1. Prepare Your Data
The extension uses an enhanced version of the JSON Resume schema.
- **Download Sample**: Click the **Sample JSON** button in the side panel to get a template.
- **Fill Template**: Add your personal details, work history, education, and skills to the JSON file.

### 2. Upload Your Profile
- Open the **Controls** tab in the side panel.
- Click **Upload JSON** to import your `resume.json`.
- (Optional) Click **Upload PDF** to attach your resume file for platforms that require a physical document upload.

### 3. Start Applying
- Navigate to a supported job application page.
- Click the **Autofill** button in the side panel.
- **Watch the magic**: The extension will map your data to the form fields instantly.

### 4. Review & Manage
- Use the **History** tab to see your past applications.
- Use the **Manage Data** tab to make quick edits to your stored profile without re-uploading a file.

---

## 📂 Project Structure

- `atsStrategies/`: Modular logic for platform-specific automation.
- `content.js`: Manages DOM interaction and triggers the autofill logic.
- `resumeProcessor.js`: Handles data normalization and validation.
- `sidepanel.js/html/css`: The modern, tabbed user interface.
- `background.js`: Manages storage and extension lifecycle.

---

## 🤝 Contributing

Contributions are welcome! To add support for a new job board:
1. Fork the repository.
2. Create a new strategy in `atsStrategies/`.
3. Submit a Pull Request.

---

## 👥 Authors

- **Sampath Velupula**
- **Ravi Kumar Rayapalli**
- **Ramana gangarao**
- **Bavish Kangari**
- **Jafar vali**
- **Jatin Thakur**
- ... and the TalentScreen Team.

---

*Built for job seekers who value their time.*
