# 🚀 Talent Direct Auto fill Extension

A powerful, intelligent Chrome Extension designed to fully automate the tedious process of filling out job applications. By leveraging the [JSON Resume](https://jsonresume.org/) standard, it maps your professional data to complex forms across dozens of Applicant Tracking Systems (ATS) with high precision.

---

## ✨ Key Features

- **📊 Application History**: Automatically tracks every form you fill and submit, complete with timestamps, company names, and job roles.
- **🔒 Smart User-Lock System**: Your manual corrections are sacred. The extension detects when you physically type into a field and "locks" it, ensuring subsequent auto-fill passes never overwrite your manual edits.
- **🔘 Floating Control Widget**: A premium, draggable overlay that appears on every fill (manual or queue), giving you instant access to **Fill**, **Next**, and **Stop/Close** controls directly on the page.
- **⚡ 100% Automatic Execution**: No "Fill" button required. The extension detects supported forms instantly and populates them as they render.
- **🧪 Robust Data Sanitization**: The resume uploader automatically strips illegal control characters from your JSON files, ensuring smooth imports from any source.

---

## 🏗️ Supported ATS Platforms

We currently support full auto-filling for the following platforms:
- **ADP**
- **ApplyToJob (JazzHR)**
- **Ashby**
- **BambooHR**
- **BrassRing**
- **Greenhouse**
- **iCIMS**
- **Indeed**
- **Jobvite**
- **Lever**
- **LinkedIn**
- **Oracle Cloud**
- **Paychex**
- **Paycom**
- **Personio**
- **Recruitee**
- **Rippling**
- **SmartRecruiters**
- **SuccessFactors**
- **Taleo**
- **Teamtailor**
- **UltiPro (UKG)**
- **Workable**
- **Workday**
- **Generic HTML Forms** (Heuristic matching for unsupported boards)

---

## 🛠️ Installation

1. **Download**: Install the extension directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/autofill-job-applications/bebdlhhpgmegdebdballinfmfnlpmeio).
2. **Add to Chrome**: Click **Add to Chrome** and pin the extension 🧩 to your toolbar for easy access.
3. Right click on the pinned extension to open Side panel.
---

## 📖 Getting Started

### 1. Prepare your `resume.json`
The extension uses an enhanced version of the JSON Resume schema. 
- Download our [**Sample Resume JSON Template**](https://github.com/Jatin-Singh2003/Autofill-extension-privacy-policy/blob/main/sample.json) to get started.
- Fill the template with your personal details, work history, education, and skills.

### 2. Upload Profile
- Click the Extension icon 🧩 in your browser toolbar to open the **Side Panel**.
- Click **Upload resume.json** and select the file you just created. The extension will securely cache it locally on your device.

### 3. Start Applying
- Navigate to any supported job application page (e.g., a Greenhouse or Workday link).
- **Watch the magic happen**: Fields will be populated automatically as they render.
    - 🟢 **Green**: High-confidence match (Auto-filled).
    - 🔴 **Red**: Required field that could not be matched.

### 4. Review & Edit
- Check the **Fill Summary** in the Side Panel to verify all answers.
- Manually correct any missed fields on the page. Your edits are automatically protected by our Smart User-Lock System!

---

## 📂 Project Structure

- `atsStrategies/`: Modular classes for platform-specific automation logic.
- `content.js`: The heart of the extension; manages DOM injection and strategy routing.
- `resumeProcessor.js`: Normalizes complex JSON schemas into a flat, searchable index.
- `sidepanel.js/html/css`: The UI layer for user interaction and data review.
- `background.js`: Manages extension lifecycle and storage synchronization.

---

## 🔮 Roadmap

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

## 🔐 Permissions Justification

To provide a seamless experience across the vast landscape of Applicant Tracking Systems (ATS), this extension requires the following permissions:

- **`activeTab`**: Powers the "Force Fill Data" context menu on custom domains and allows interaction with the current form without running in the background.
- **`storage`**: Used to securely store your resume data locally on your device for autofilling.
- **`host_permissions` (Specific ATS Domains)**: We strictly whitelist major ATS domains (e.g., Workday, Lever, Greenhouse) for automatic injection. This ensures maximum browser performance and privacy by avoiding injection on every website you visit.
- **`sidePanel`**: Provides a convenient interface for managing your resume data and triggering the autofill without obscuring the application form.

---

## 👥 Authors

- **Sampath Velupula**
- **Ravi Kumar Rayapalli**
- **Ramana gangarao**
- **Bavish Kangari**
- **Jafar vali**
- **Jatin Thakur**
- **Jashuva Billa**
- **GuruTeja Nakkala**
- **Mahender Goud Bathini**
- **Sai Ram**
- **Adarsh Teja Kalakanda**
- **Sunil Poli**
- **Pathan Karimulla**
- **Hemant Kumar**
- **Jawahar Reddy Nimma**
- **Rohith Yadav Avula**
- **Ajmer Khaja Md**
- **Manisai Saduvala**
- **Shiva patel**
- **Pathan Mohammad Rajak**

---

*Built for job seekers who value their time.*
