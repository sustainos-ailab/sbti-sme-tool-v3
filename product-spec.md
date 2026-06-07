# Product Spec — SBTi SME Readiness Assessment

**Version:** 3.0
**Date:** 7 June 2026
**Author:** Zyad Hatquai
**Status:** Confirmed

---

> **About this document**
> This spec is produced by the Tool Architect skill following a structured interview. It is not filled in manually. Once complete, it travels to the Supabase Expert skill (Tier 2 or 3 only), then to the Project Governor skill, and then to Claude Code. Every section must be complete and confirmed before the next skill in the sequence begins. Sections marked **CONDITIONAL** are left blank when the condition does not apply.

---

## Section 1 — Tool Summary

**Tool name:** SBTi SME Readiness Assessment
**What it does:** A 4-phase wizard that guides SME companies through SBTi eligibility and target-setting requirements, then delivers a personalised PDF report to the user's verified email address. Version 3.0 replaces browser-side PDF download and anonymous lead capture with magic link email verification and server-side AI-assisted report delivery.
**Who uses it:** Sustainability professionals at SME companies, accessing the tool via a public shared link.
**Why it exists:** To guide SME companies through SBTi eligibility and target-setting in under 5 minutes, verify lead email quality via magic link, and deliver a polished report that demonstrates SustainOS expertise and drives cohort signups at ailab.sustainos.io.

---

### Scope

**What this build includes:**

1. Welcome screen simplified — intro text and "Start Assessment" button only. All input fields removed (name, email, company, GDPR checkbox).
2. Results screen modified — results display unchanged. "Generate PDF" button removed. New section added below results: name field (required), email field (required), company name field (required), GDPR consent checkbox (required), data statement, error message block, "Send my report →" button.
3. New "Check your inbox" screen — appears after "Send my report" is clicked. Tells the user to check their email and click the magic link.
4. New "Report on its way" screen — appears after the user returns via the magic link and their session is confirmed. Confirms report is being generated. Triggers the Netlify Function in the background.
5. Page load handler — on every page load, checks for an active Supabase session. If found, routes the user to the "Report on its way" screen and calls triggerReport().
6. Full assessment state saved to Supabase on form submit — as soon as "Send my report" is clicked and validation passes, a row is inserted into the submissions table containing all contact fields, all assessment answers (JSONB), all results data (JSONB), and status = `pending_verification`.
7. Magic link sent via Supabase Auth — supabase.auth.signInWithOtp fires to the user's email after the Supabase insert completes.
8. New Netlify Function — /send-report — called by the client after magic link return. Receives the user's Supabase access_token. Queries the submissions table for the user's record. Calls the Anthropic API to generate the personalised email intro. Generates the PDF server-side using jsPDF in Node.js. Sends the email via Resend with the PDF attached. Updates the submission status to `report_sent`.
9. AI-generated personalised intro — 3–4 sentences written by the Anthropic API, using the user's company name, eligibility outcome, GHG inventory values, and selected target path. One main takeaway highlighted. Runs inside the Netlify Function.
10. Fixed sign-off script — Zyad's hardcoded text appended below the AI intro in every email. Not AI-generated. Content confirmed in Section 8.
11. Email sent via Resend — one email per completed assessment, to the verified email address. Subject: "Your SBTi SME Readiness Report — [Company Name]". Attachment: PDF named SBTi_SME_Report_[CompanyName].pdf.
12. PDF generated server-side — jsPDF running in Node.js inside the Netlify Function. Design matches the current PDF exactly. Not stored in Supabase — generated in memory and attached to the email.
13. startOver() updated — resets all state fields and calls supabase.auth.signOut() to clear any active session.
14. Supabase submissions table — replaces the v2.0 leads table. New schema with full assessment data, contact fields, and status.
15. Supabase Auth configured — magic link, open signup, redirect URL set to the tool's Netlify URL.

**What this build does NOT include:**

1. Re-sending the report on user request
2. Users logging back in to access their report after the session ends
3. Deduplication enforcement for multiple submissions from the same email
4. Admin email notification to Zyad on new submission
5. Admin panel — Supabase dashboard is used directly
6. Newsletter signup automation — submissions exported manually from Supabase
7. Changes to any Q1–Q10 screens, calibration screen, target selection screen, stop screens, or their underlying logic
8. PDF design changes — the server-side PDF must replicate the current design exactly
9. Changes to any existing CSS — new elements on the results screen use only existing CSS classes

---

### Build Status

**Status:** Iteration — previous spec was v2.0 (product-spec.md, 7 June 2026)

**Previous spec reference:** product-spec.md v2.0, 7 June 2026

**What changes in this build:**
- Welcome screen: all input fields removed. Intro + "Start Assessment" only. startAssessment() needs no validation — there are no fields.
- Results screen: "Generate PDF" button removed. New contact form section added (name, email, company, GDPR consent, data statement, error block, "Send my report" button). New function: submitContactForm().
- New screen: "Check your inbox"
- New screen: "Report on its way"
- New page load logic: checks for active Supabase session on every page load. If authenticated, routes to "Report on its way" and calls triggerReport().
- New function: submitContactForm() — validates fields, assembles JSONB from state, inserts to Supabase, fires signInWithOtp, shows check inbox screen.
- New function: triggerReport() — called after magic link return, sends access_token to /send-report Netlify Function.
- generatePDF() — removed entirely. PDF generation moves to the Netlify Function.
- startOver() — gains supabase.auth.signOut() call.
- New Netlify Function: /send-report
- jsPDF CDN tag in HTML: removed (PDF generation is now server-side in the Netlify Function).
- Supabase Auth: enabled. Magic link configured with redirect URL.
- Supabase schema: leads table replaced by submissions table.

**What carries over unchanged:**
All Q1–Q10 question screens and sub-question logic, calibration screen, target option selection screen, stop screens, results display content and layout, all CSS and visual design, all existing state fields (phase, step, answers, selectedOption, companyName), progressBar(), render(), showError(), hideError(), all answerQX() functions, eligibility rules, GHG calculation logic, minimum ambition formula, target option logic, Supabase JS SDK CDN tag in HTML.

**Schema impact:** The v2.0 leads table is dropped and replaced by a new submissions table with a significantly expanded schema. The Supabase Expert must drop leads and create submissions. Supabase Auth was not enabled in v2.0 — it must be enabled and configured in this upgrade. The existing Supabase project (eu-central-1, Frankfurt) is reused.

---

## Section 2 — Classification

### Preliminary Check — Mixed Access Pattern

**Does this tool have both a direction where anyone can view or submit data AND a direction where only specific users can write or update data?**
No. The tool is entirely public-facing. Internal management of submissions happens directly in the Supabase dashboard — not through this tool.

---

### Data Model

**Decision:** D3

| Label | What it means | This tool? |
|-------|--------------|-----------|
| D1 — Hardcoded | All data written into the code. Users cannot input anything that persists. | No |
| D2 — Session | Data enters during use and disappears when the tab closes. No database. | No |
| D3 — Persisted | Data written to a database and survives after the session ends. Supabase required. | **Yes** |

**Reason:** Assessment answers, contact details, eligibility outcome, and submission status must all survive the session — the magic link redirects the browser away from the page, destroying in-memory state, so all data must be in Supabase before the magic link fires.

**D3 checks that apply:**
- [x] Data must be retrievable after the session ends
- [x] Multiple sessions contribute to the same dataset
- [x] Data submitted by one person must be visible to another (the Netlify Function reads it server-side after magic link return)

---

### Access Model

**Decision:** A2

| Label | What it means | This tool? |
|-------|--------------|-----------|
| A1 — Public | Anyone with the URL. No login required. | No |
| A2 — Authentication | Login required. All authenticated users see the same thing. | **Yes** |
| A3 — Authorization | Login required. Different roles see different data. | No |

**Reason:** Supabase magic link creates a lightweight authenticated session used to confirm the user owns their email address before the Netlify Function retrieves their data and sends the report.

**Auth reason:** Identity and continuity — verified email ownership is required before the report is delivered. The tool must know the user controls the address they entered.

**Signup model:** Open — any user who completes the assessment can enter their email and receive a magic link. No invite required.

---

### Tier

**Tier:** 3

| Tier | D+A | Stack | Deployment |
|------|-----|-------|------------|
| 3 | D3+A2 | Netlify + Supabase (Auth + RLS) | Netlify |

---

### Standalone or Stack

**This tool is:** Standalone — does not share a database with any other tool.

---

## Section 3 — Arms

### AI API Arm

**Active:** Yes

| Detail | Answer |
|--------|--------|
| What it does in this tool | Generates a personalised email intro: 3–4 sentences using the user's company name, eligibility outcome, GHG inventory values, and selected target path. One main takeaway highlighted. Every sentence uses the user's actual assessment data — no generic text. |
| What triggers it | Client calls the /send-report Netlify Function after magic link return and session confirmation. User-triggered, runs server-side. |
| Function placement | Netlify Function — /send-report |
| Token limit per request | 500 tokens. Short output only — 3–4 sentences maximum. |

API key stored as Netlify environment variable: `ANTHROPIC_API_KEY`. Never in client-side code.

---

### Export Arm

**Active:** No

The PDF is generated server-side inside the Netlify Function and sent as an email attachment — not downloaded by the browser. The export arm (browser-side, user-triggered download) is removed in this version.

---

### Email Arm

**Active:** Yes

| Detail | Answer |
|--------|--------|
| Trigger event | Client calls /send-report Netlify Function after magic link return and Supabase session confirmed. User-triggered, runs server-side. |
| Recipient | The user's verified email address — the address they entered on the results screen and confirmed by clicking the magic link. |
| Email content | Subject: "Your SBTi SME Readiness Report — [Company Name]". Body: AI-generated personalised intro (3–4 sentences, see AI arm above) followed immediately by Zyad's fixed sign-off script (hardcoded, see Section 8 — Email Content). |
| File attachment in transit | Yes — PDF report. Generated server-side in the Netlify Function using jsPDF in Node.js. Design matches the current PDF exactly: purple header block, company name in header and footer, section dividers, lime accent on target language block, page numbers. Named: SBTi_SME_Report_[CompanyName].pdf. Not stored in Supabase — generated in memory and attached directly. |
| Function placement | Netlify Function — /send-report |

Email service: Resend. API key stored as Netlify environment variable: `RESEND_API_KEY`.

---

### Scheduled Automation Arm

**Active:** No

---

## Section 4 — Stack and Deployment

| Detail | Answer |
|--------|--------|
| Frontend framework | HTML/CSS/JS — single file, no framework, no build process. Existing architecture carries over. Magic link handling uses Supabase JS SDK on page load. |
| Deployment target | Netlify |
| GitHub | Required — existing repo from v2.0. Updated in place. |

---

## Section 5 — Data Architecture

### CONDITIONAL — Data Model is D3: applies

**submissions table (replaces leads from v2.0):**

| Field name | Plain language label | Data type | Who provides it | Required? |
|-----------|---------------------|-----------|----------------|-----------|
| id | Record ID | uuid, primary key, gen_random_uuid() | System (auto) | Yes |
| name | Full name | text | User — results screen form | Yes |
| email | Email address | text | User — results screen form | Yes |
| company_name | Company name | text | User — results screen form | Yes |
| assessment_answers | All assessment answers | jsonb | System — captured from state at form submit | Yes |
| assessment_results | Eligibility outcome, GHG values, target path, target language | jsonb | System — captured from state at form submit | Yes |
| status | Submission status | text, default 'pending_verification' | System — updated by Netlify Function to 'report_sent' after email is sent | Yes |
| created_at | Submitted at | timestamptz, default now() | System (auto) | Yes |

**Tables needed:**

| Table name | What it stores | Key fields |
|-----------|---------------|-----------  |
| submissions | One row per completed assessment — contact details, full assessment state, and delivery status | name, email, company_name, assessment_answers, assessment_results, status, created_at |

**File storage:** No. The PDF is generated in memory inside the Netlify Function and attached to the outgoing email. It is never written to Supabase Storage.

**Derived or calculated data:** No. All values are either entered by the user or calculated by the existing client-side assessment logic and captured to state. The Netlify Function reads the stored JSONB — it does not recalculate anything.

**Data retention requirement:** No specific requirement.

---

## Section 6 — Access and Permissions

### CONDITIONAL — Data Model is D3: applies

### Anon Key RLS

The Supabase anon key is embedded in the HTML file. RLS restricts what it can do.

| Table | Can read | Can insert | Can update | Can delete | Notes |
|-------|----------|------------|------------|------------|-------|
| submissions | No | Yes | No | No | Insert only — used to save the full assessment state before the magic link fires. Anon key cannot read, update, or delete any row. |

### CONDITIONAL — Auth Configuration: applies (A2)

**Authentication method:** Magic link — Supabase signInWithOtp
**Signup model:** Open — any user may enter their email and receive a magic link.
**Magic link redirect URL:** The tool's Netlify URL. Must be configured in Supabase Auth settings (Authentication > URL Configuration > Site URL and Redirect URLs) before testing. Zyad provides the final Netlify URL — see Section 15.

### CONDITIONAL — Authenticated User RLS: applies (A2)

| Table | User type | Can read | Can insert | Can update | Can delete |
|-------|----------|----------|------------|------------|------------|
| submissions | Authenticated | Own rows only — `auth.jwt() ->> 'email' = email` | No | Own rows only — status field update by Netlify Function using user's JWT | No |

**Note on the Netlify Function and Supabase access:** After magic link return, the client retrieves its Supabase access_token from supabase.auth.getSession() and passes it to the /send-report Netlify Function. The Function initialises a Supabase client using that token — not a service role key — so the authenticated user's RLS policies apply server-side. No service role key is required or used in this tool.

---

## Section 7 — GDPR

### CONDITIONAL — D3 and personal data collected: applies

**Personal data collected in this tool:** Name and email address.

**Consent checkbox label text shown to the user at the point of collection:**
"I agree that my name and email will be stored securely and used only to send me my SBTi assessment report and follow-up resources from SustainOS."

**Data statement text shown to users:**
> Your name and email will be stored securely and used only to deliver your report and send follow-up resources from SustainOS. You can request deletion of your data at any time by emailing info@sustainos.io.

**Deletion mechanism:** User emails info@sustainos.io. Processed manually by Zyad Hatquai via the Supabase dashboard.

**Supabase project region:** EU — Frankfurt (eu-central-1). Confirmed from v2.0 — existing project is reused.

---

## Section 8 — Screen and UI Structure

**Navigation model:** Step-by-step flow (existing, carries over).

---

### Welcome Screen — Modified

- **Purpose:** Introduce the tool and invite the user to begin. No data collection.
- **What is visible:**
  - Existing: title "Are you ready for SBTi SME?", subtitle, four feature pills — unchanged
  - REMOVED: name field, email field, company name field, GDPR consent checkbox, error message block
  - Existing: "Start Assessment →" button — unchanged
- **User actions:** Read the intro. Click "Start Assessment."
- **What happens next:** startAssessment() runs. No validation — no fields present. Phase 1 begins immediately.
- **Loading state:** None.
- **Error state:** None.

---

### Assessment Screens — Phases 1 to 4 — Unchanged

All Q1–Q10 question screens, sub-questions, calibration screen, target option selection screen, and stop screens carry over with zero changes.

---

### Results Screen — Modified

- **Purpose:** Display the assessment results and collect contact details for report delivery.
- **What is visible:**
  - Existing: full results display (submission roadmap, eligibility proof, GHG inventory, selected target, official target language) — unchanged
  - New: section heading — "Get your full report by email"
  - New: name input field, label "Your name", placeholder "e.g. Ana Müller", required, uses `.input-field` / `.input-label` / `.input-group` classes
  - New: email input field, label "Your email address", placeholder "e.g. ana@acmetextiles.com", required, same classes
  - New: company name input field, label "Your company name", placeholder "e.g. Acme Textiles GmbH", required, same classes
  - New: GDPR consent checkbox using existing `.checkbox-item`, `.checkbox-custom`, `.checkbox-label` classes. Label text: per Section 7.
  - New: data statement text using existing `.info-note` class. Text: per Section 7.
  - New: error message block, hidden by default, uses existing `.error-msg` class
  - New: "Send my report →" button (replaces "Generate PDF")
  - Existing: "Start Over" button — unchanged
- **User actions:** Fill in name, email, company name. Tick the consent checkbox. Click "Send my report."
- **What happens next:** submitContactForm() runs.
  1. Validates name, email, company_name, and consent. If any field is empty or consent is unticked: error message appears — "Please enter your name, email address, and company name, and accept the data terms to continue." Magic link is not sent.
  2. If validation passes: captures name, email, company_name to state. Assembles assessment_answers JSONB and assessment_results JSONB from existing state. Inserts full row to submissions table via Supabase anon key. On insert complete (or silent failure): calls supabase.auth.signInWithOtp({ email: state.userEmail }). Shows "Check your inbox" screen.
- **Loading state:** "Send my report" button text changes to "Sending…" while the insert and magic link call are in flight.
- **Error state:** If magic link send fails: error message — "We couldn't send your link. Please check your email address and try again." Supabase insert failure is silent — execution continues to the magic link step regardless.

---

### Check Your Inbox Screen — New

- **Purpose:** Confirm the magic link has been sent and tell the user what to do next.
- **What is visible:**
  - Heading: "Check your inbox"
  - Body: "We've sent a link to [state.userEmail]. Click it to receive your report."
  - Note: "The link expires in 60 minutes. Check your spam folder if you don't see it."
  - "Start Over" text link
- **User actions:** None. The user goes to their email inbox.
- **What happens next:** User clicks the magic link in their email. Browser returns to the tool URL with auth params in the URL hash. The page load handler detects the session and routes to the "Report on its way" screen.
- **Loading state:** N/A — passive waiting screen.
- **Error state:** N/A.

---

### Report On Its Way Screen — New

- **Purpose:** Confirm report delivery is in progress. Trigger the Netlify Function.
- **What is visible:**
  - Heading: "Your report is on its way"
  - Body: "We're generating your personalised report now. It will arrive at [state.userEmail] within a few minutes."
  - "Start Over" text link
- **User actions:** None.
- **What happens next:** On screen render, triggerReport() is called automatically. This retrieves the Supabase access_token from supabase.auth.getSession() and sends it to the /send-report Netlify Function via a POST request. If the function call fails, no error is surfaced — the screen remains as shown. If it succeeds, no additional UI change is needed.
- **Loading state:** The "generating" message is the persistent state of this screen. No additional spinner required.
- **Error state:** Silent. Function failure is not shown to the user.

---

### Page Load Handler — Magic Link Return

- **Purpose:** Detect when the user has returned to the tool via the magic link and route them correctly.
- **Logic:** On every page load, call supabase.auth.getSession(). The Supabase JS SDK processes the magic link token in the URL hash automatically when getSession() is called — no manual token parsing is needed.
  - If a valid session is returned (user is authenticated): skip the normal welcome screen. Restore state.userEmail from session.user.email. Show the "Report on its way" screen. Call triggerReport().
  - If no session: show the normal welcome screen and proceed as usual.

---

### Email Content

**Subject line:** Your SBTi SME Readiness Report — [Company Name]

**Email body structure:**

```
[AI-generated personalised intro — 3 to 4 sentences]
[Generated by Anthropic API inside the Netlify Function]
[Inputs used: company_name, eligibility outcome, GHG inventory totals, target path name]
[One main takeaway for this specific company highlighted]

The tool you just used? I built it from scratch.
I'm not a developer. I'm a sustainability manager who knows SBTi inside out and decided that knowledge was worth more than a spreadsheet.
So I used AI to turn it into this: a real assessment tool that captures your inputs, analyzes them, and sends you this email automatically.
I never thought I could build 1% of this. Yet here we are.
Your knowledge can do the same thing. If you want to learn how, this is where I teach it:
ailab.sustainos.io
Talk soon, Zyad
```

The sign-off block is hardcoded text in the Netlify Function. It is not generated by AI and does not change per user.

**PDF attachment:** SBTi_SME_Report_[CompanyName].pdf
Generated in memory by jsPDF (Node.js) inside the Netlify Function. Design identical to current browser-side PDF: purple header block, company name in header and footer, section dividers, lime accent on target language block, page numbers. Content: eligibility proof, GHG inventory, selected target path, official target language, 6-step submission roadmap.

---

### Start Over — Modified

startOver() resets all state fields including state.userName, state.userEmail, state.companyName, state.assessment_answers, state.assessment_results — plus all existing resets (state.phase, state.step, state.answers, state.selectedOption, state.companyName, window._q4checked, window._selectedOpt). Also calls supabase.auth.signOut() to clear any active Supabase session. Then calls showWelcome().

---

**Mobile responsive:** Yes — existing responsive CSS carries over. New fields and checkbox on the results screen use only existing CSS classes and fit within the current layout.

---

## Section 9 — Logic and Calculations

### CONDITIONAL — not applicable to this upgrade

Existing assessment logic (eligibility rules, GHG calculations, minimum ambition formula, target option logic) carries over unchanged. No new logic or calculations are introduced in v3.0.

---

## Section 10 — Brand and Visual Direction

**Brand file:** No BRAND.skill in project folder.

Existing CSS carries over in full. New elements (name field, email field, company field, consent checkbox, data statement, error message) must use only existing CSS classes already present in index.html:

- Input fields: `.input-field`, `.input-label`, `.input-group`
- Consent checkbox: `.checkbox-item`, `.checkbox-custom`, `.checkbox-label`
- Error message: `.error-msg`
- Data statement: `.info-note`
- New screens (check inbox, report on its way): use existing card and section styling from the results screen. No new CSS classes.

No new CSS classes may be added. No visual changes to any existing screen.

- **Primary colour:** #7B2FBE (purple)
- **Secondary colour:** #C8F135 (lime)
- **Fonts:** Syne (headings, 700/800), DM Sans (body, 300/400/500)
- **Visual feel:** Bold, dark background, data-heavy

---

## Section 11 — API and Credentials

| Service | What it does in this tool | Key required | Where key is stored |
|---------|--------------------------|-------------|-------------------|
| Supabase | Database (anon insert from browser) + Auth magic link (from browser) + Authenticated read and update (via Netlify Function using user JWT) | SUPABASE_URL — public. SUPABASE_ANON_KEY — public, safe to embed with RLS. | SUPABASE_URL and SUPABASE_ANON_KEY: JS constants embedded in HTML script block (client-side). Also required as Netlify environment variables for the Netlify Function. |
| Anthropic API | Generates personalised email intro inside the Netlify Function | ANTHROPIC_API_KEY | Netlify environment variable only. Never in client-side code. |
| Resend | Sends report email with PDF attachment inside the Netlify Function | RESEND_API_KEY | Netlify environment variable only. Never in client-side code. |

**No service role key.** The Netlify Function uses the user's Supabase access_token (received from the client after magic link verification) to initialise an authenticated Supabase client. The user's RLS policies apply server-side. The service role key bypasses RLS and is not needed here.

**Four Netlify environment variables required before testing:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`

`.env` file must be in `.gitignore` before the first push to GitHub.

---

## Section 12 — Out of Scope — Phase 2

| Deferred feature | Reason it is deferred |
|-----------------|----------------------|
| Re-sending the report on request | User can restart the assessment and resubmit |
| Users logging back in to access their report | No persistent account — magic link session is one-time |
| Deduplication enforcement for multiple submissions from the same email | Not critical for MVP — manageable via Supabase dashboard |
| Admin notification email to Zyad on new submission | Not required at this scale |
| Admin panel for reviewing and managing submissions | Supabase dashboard used directly |
| Newsletter signup automation | Submissions exported manually from Supabase |
| Changes to Q1–Q10 screens or assessment logic | Carries over unchanged |
| PDF design changes | Server-side PDF replicates current design exactly |

---

## Section 13 — Acceptance Criteria

| The build is complete when: |
|-----------------------------|
| The welcome screen loads with the intro text and "Start Assessment" button only — no input fields are present. |
| A user clicks "Start Assessment" and Phase 1 begins immediately with no validation step. |
| A user completes the full assessment and arrives at the results screen — the results display is visible and the contact form (name, email, company, consent) appears below it. |
| A user leaves any of the name, email, or company fields empty and clicks "Send my report" — the error message appears and the magic link is not sent. |
| A user leaves the GDPR consent checkbox unticked and clicks "Send my report" — the error message appears and the magic link is not sent. |
| A user fills in all three fields, ticks consent, and clicks "Send my report" — a new row appears immediately in the Supabase submissions table with the correct name, email, company_name, populated assessment_answers JSONB, populated assessment_results JSONB, and status = `pending_verification`. |
| After clicking "Send my report", the "Check your inbox" screen appears with the user's email address displayed correctly. |
| The user receives the magic link email in their inbox from the configured Resend sender address. |
| The user clicks the magic link — the browser returns to the tool and the "Report on its way" screen is shown with the user's email address displayed. |
| The user receives the report email at their verified address. Subject line contains "Your SBTi SME Readiness Report" and the company name. |
| The AI-generated intro in the email body references the user's company name, their eligibility outcome, and one specific takeaway from their assessment data. It is not generic placeholder text. |
| Zyad's fixed sign-off script appears below the AI intro, verbatim, in every email. |
| The PDF report is attached to the email, named SBTi_SME_Report_[CompanyName].pdf. |
| The PDF matches the current design: purple header block, company name in header and footer, lime accent on target language block, page numbers. |
| After the email is sent, the submissions table row for that email updates to status = `report_sent`. |
| A user clicks "Start Over" from any screen — all state is cleared, any active Supabase session is signed out, and the welcome screen loads with empty state. |

---

## Section 14 — Build Path

**This tool's tier:** Tier 3

**Tier 3 path:**
- [x] Tool Architect skill — this spec
- [ ] Update existing GitHub repo — confirm index.html base file is present
- [ ] Supabase Expert skill — drops leads table, creates submissions table with new schema, enables Supabase Auth, configures magic link with redirect URL, writes and tests RLS policies (anon INSERT on submissions; authenticated SELECT and UPDATE own rows). All confirmed and tested before moving forward.
- [ ] Supabase Expert confirms: submissions table created, RLS active and tested, Auth magic link tested end-to-end with a real email, redirect URL configured correctly.
- [ ] Project Governor skill — produces CLAUDE.md using this spec and confirmed Supabase setup
- [ ] Claude Code — builds from spec + CLAUDE.md + confirmed Supabase setup
- [ ] Add all four Netlify environment variables before testing: SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY
- [ ] Confirm Resend sender domain is verified before email testing
- [ ] Deploy to Netlify

**Before Claude Code begins — confirm all of the following:**
- [ ] This spec is complete and confirmed
- [ ] Supabase Expert confirms submissions table, RLS, and Auth are all complete and tested
- [ ] CLAUDE.md is written by the Project Governor and is in the project folder
- [ ] GitHub repo is updated and connected to Netlify
- [ ] All four Netlify environment variables are set
- [ ] Resend sender domain is verified
- [ ] .env is in .gitignore before the first push

---

## Section 15 — Open Questions

| Question | Who answers it | Blocking? |
|----------|---------------|-----------  |
| What is the final Netlify URL for the tool? | Zyad — needed before Supabase Expert session | Yes — Supabase Auth redirect URL must match the exact deployed URL |
| What is the Resend "from" name and sender email address? | Zyad — before Claude Code session | Yes — Resend requires a verified sender domain and configured "from" address before email can be sent |
| Is the Resend sender domain already verified for this project? | Zyad — before Claude Code session | Yes — email will not send from an unverified domain |

---

*This spec is the authoritative source of truth for this build. Written for Claude Code and the Supabase Expert skill. Assumes zero prior context. If it is not written here, it will not be built.*
