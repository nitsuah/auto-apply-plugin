# Features

Core capabilities are grouped below by category.

### 🧠 Candidate Profile Intelligence

Learns from your resume and saved profile data so future applications can be completed more accurately and consistently.

- **Resume Learning**: Extracts and reuses experience, education, skills, and personal details from your resume
- **Profile Reuse**: Applies previously captured candidate information across multiple job applications
- **Memory Review Controls**: Lets you edit, ignore, restore, and remove remembered answers directly from Profile

### 🎯 Job Matching and Response Generation

Uses job-specific context to understand role requirements and tailor application content.

- **JD Parsing**: Reads job descriptions to identify requirements, keywords, and role-specific context
- **Tailored Answer Generation**: Produces customized answers aligned to the job description and your background

### 📝 Application Automation

Focuses on reducing manual effort during the application process.

- **Form Fill Automation**: Automatically fills supported application forms with candidate and job-specific data
- **Supported ATS Platforms**: Works with supported applicant tracking systems used by common job portals and employer sites
- **Receiver Auto-Recovery**: Retries content-script injection automatically when a supported page initially has no active receiver

### 🔍 Multi-Source Job Search

Aggregates listings from multiple job boards in one panel so you can discover, filter, and save jobs without leaving the extension.

- **10 Job Sources**: Six keyless boards active by default (Remotive, Arbeitnow, The Muse, Remote OK, Jobicy, Working Nomads); four BYOK keyed sources (Adzuna, USAJOBS, Reed, Jooble) unlock when credentials are added in the AI panel
- **Per-Source Filter Chips**: Toggle individual sources on/off; locked chips route to the AI settings panel to configure keys
- **Pay Filter with Hide-Unknown Toggle**: Annual/hourly dual-slider with an explicit checkbox to hide jobs without a published salary range
- **Remote, Type, and Location Filters**: Narrow results by work mode, employment type, and region (USA / Europe / Remote / Other)
- **One-Click Save to Tracker**: Captures any result directly into the application pipeline as a draft with title, company, salary, and description
- **Plug-and-Play Source Registry**: New boards added in `lib/job-search.js` by appending a single registry entry; no other plumbing required

### 📌 Tracking and Workflow

Helps organize and monitor applications after submission.

- **Application Tracker**: Keeps a record of applications, statuses, and related job details in one place
- **Workflow Support**: Streamlines repeated application steps to make high-volume applying easier to manage
- **Structured Pay and Verdict Editing**: Captures pay as min/max values and keeps verdict as controlled sentiment options
- **Advanced Card Editing**: Supports editable URL, location presets with custom fallback, and drag-lock while cards are in expanded edit mode

<!--
AGENT INSTRUCTIONS:
This file documents features using a structured format for parsing.

CRITICAL FORMAT REQUIREMENTS:
1. Use ### (h3) for category headers - DO NOT use ## or ####
2. Category names can include emojis (e.g., "### 📊 Repository Intelligence")
3. Each feature MUST be a bullet list item: "- **Feature Name**: Description"
4. Keep feature descriptions on single lines for reliable parsing
5. You can add brief category descriptions as regular text after the header
6. Avoid nested lists or complex markdown that breaks parsing

When adding features:
1. Group related features under appropriate ### categories
2. Use bold (**Feature Name**) followed by colon and description
3. Keep descriptions concise and single-line
4. Add emojis to category headers for visual appeal (optional)
-->
