# 🤖 Apply Workspace — Local-First AI Job Application Chrome Extension

> Save your profile once. Land on any job page. Review tailored answers. Fill faster.

No Docker. No server. No subscription. Review-first by default.

---

## The Problem

Job applications are the same 20 questions on 47 different forms.
Nobody has time for that. Nobody should have to.

---

## The Solution

A Chrome extension that:
1. **Stores your profile locally** once (resume, defaults, safe memory)
2. **Detects job application forms** automatically
3. **Reads the JD** from the page or pasted text
4. **Generates tailored answers** per role using your own Gemini API key
5. **Keeps you in review** before filling the form in place

**Local-first. Review-first. Private. Fast.**

---

## Quick Start (< 5 minutes)

1. Clone this repo (or download as ZIP)
2. Open `chrome://extensions` → enable **Developer mode**
3. Click **Load unpacked** → select the repo folder
4. Click the 🤖 icon → paste your [free Gemini API key](https://aistudio.google.com/app/apikey) and leave the model on **Auto**
5. Upload your resume (PDF, DOCX, or paste text)
6. Navigate to a job page → click the icon → **Fill This Application**

---

## Project Structure

```
apply-workspace/
├── manifest.json          # Chrome MV3 manifest
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── screenshots/           # README gallery assets
├── content/               # Runs on job pages
│   └── content.js         # Form detection + injection
├── background/
│   └── service-worker.js  # API calls, storage management
├── lib/
│   ├── gemini.js          # Gemini API wrapper
│   ├── resume-parser.js   # Resume structuring
│   ├── jd-parser.js       # JD extraction
│   ├── form-filler.js     # DOM injection
│   └── tracker.js         # Application tracking
├── data/
│   └── field-map.json     # Common field name → answer key mappings
└── icons/                 # Extension icons
```

---

## Supported ATS Platforms

| Platform | Detection | Form Fill | Status |
|----------|-----------|-----------|--------|
| Greenhouse | ✅ | ✅ | Phase 1 |
| Ashby | ✅ | ✅ | Phase 1 |
| Lever | ✅ | ✅ | Phase 1 |
| LinkedIn Easy Apply | ✅ | ✅ | Phase 1 |
| Workday | ✅ | 🔄 | Phase 2 |
| iCIMS | ✅ | 🔄 | Phase 2 |
| Generic (any form) | ✅ | 🔄 | Phase 2 |

---

## Screenshots

> Maintenance note: after any significant popup, tracker, or profile UI update, regenerate these images so the README stays current.

### Main dashboard

![Apply Workspace main dashboard](screenshots/main-dashboard.png)

### Tracker workspace

![Apply Workspace tracker workspace](screenshots/tracker-workspace.png)

### Profile + Memory

![Apply Workspace profile and memory](screenshots/profile-memory.png)

---

## CSV Import for Tracker History

Use **Tracker → Import CSV** to bring in past applications from another sheet or export.
Accepted headers are case-insensitive and can include:

- `Company`
- `Role Title` / `Title`
- `Status`
- `Date`
- `Employment Type`
- `Remote`
- `Location`
- `Salary Range`
- `Scorecard`
- `Verdict`
- `URL`
- `Notes`

Example header row:

```csv
Company,Role Title,Status,Date,Employment Type,Remote,Location,Salary Range,Scorecard,Verdict,URL,Notes
```

---

## Tech Stack

- **Chrome MV3** extension
- **Auto-selected Gemini 2.5 models** via REST API (`models.list` + fallback strategy)
- Data is stored locally in `chrome.storage.local`; external requests only go to the Gemini API using your key.  

- Zero dependencies, zero build step — just load and use

---

## Storage Schema

```json
{
  "resume": {
    "structured": { "name": "", "email": "", "skills": [], "experience": [], ... },
    "excerpt": "plain-text excerpt/preview (≤1000 chars, including uploaded file/data-URL resumes)"
  },
  "settings": {
    "gemini_api_key": "...",
    "preferred_salary_min": 150000,
    "preferred_salary_max": 325000,
    "work_authorization": "US Citizen",
    "preferred_remote": true
  },
  "applications": [
    {
      "id": "uuid",
      "company": "Anthropic",
      "title": "IT Systems Engineer",
      "url": "...",
      "status": "submitted",
      "date": "2026-04-04",
      "jd_snippet": "...",
      "answers_generated": true
    }
  ]
}
```

---

## Privacy

- Your resume and API key are stored **only** in your local browser storage.
- The only external network call is to the Gemini API with your own key.
- No servers, no accounts, no telemetry.

---

## License

MIT — built because filling out the same form 47 times is beneath everyone. 🤙
