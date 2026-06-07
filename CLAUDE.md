# SBTi SME Readiness Assessment

## Identity
A 4-phase wizard guiding SME companies through SBTi eligibility and target-setting, delivering a personalised PDF report to a verified email address. Used by sustainability professionals accessing the tool via a public shared link.
Tier: 3 — D3+A2 — data persists to Supabase, magic link authentication (open signup), publicly accessible.
Position: Standalone

## Commands
```
open index.html
```
or serve locally:
```
npx serve .
```

## Tech Stack
HTML · CSS · JavaScript · Netlify · Supabase · Resend · Anthropic API
Deployment: GitHub → Netlify (auto-deploys from main branch)

## Arms
AI API — user-triggered — /netlify/functions/send-report — 500 tokens per request — public tool
Email (Resend) — user-triggered — /netlify/functions/send-report — fires after magic link return and Supabase session confirmed

## Environment Variables
SUPABASE_URL — Supabase: Project Settings → API → Project URL
SUPABASE_ANON_KEY — Supabase: Project Settings → API → anon / public key
ANTHROPIC_API_KEY — Anthropic console (platform.anthropic.com)
RESEND_API_KEY — Resend dashboard (resend.com)

All four variables are in Netlify: Site settings → Environment variables.
Never in any file committed to GitHub.
Note: SUPABASE_URL and SUPABASE_ANON_KEY are also embedded as JS constants in the HTML file — this is intentional and safe with RLS correctly configured.

## Supabase
Project URL: https://dajnizibuzsvyofiezlg.supabase.co

Tables:
submissions: id, name, email, company_name, assessment_answers, assessment_results, status, created_at

RLS:
submissions (anon): insert-only. No read, update, or delete.
submissions (authenticated): read own rows only and update own rows only — matched by auth.jwt() ->> 'email' = email.

Auth: magic link (signInWithOtp) — open signup

Full schema, field types, and RLS policies: docs/supabase-setup.md

## Hard Rules
- API keys never in any frontend file or GitHub commit. Always Netlify environment variables, always called through a server-side function.
- Netlify Identity: never. Supabase Auth is the only authentication system in this stack.
- RLS: never disabled on any table. If a query fails, fix the policy or the query — do not disable RLS to work around it.
- Token limit: 500 tokens per request on the AI arm. This tool is accessible to unvetted users — no exceptions.
- GDPR: consent checkbox required on the submission form before any data is submitted. Personal data collected: name and email. Supabase region: EU Frankfurt confirmed.

## Brand
No brand file provided. Inline defaults apply until docs/BRAND.md is added.
- Background: #0A0A0A (provisional — confirm against existing index.html before deployment)
- Accent: #7B2FBE (purple)
- Secondary: #C8F135 (lime)
- Fonts: Syne (headings, 700/800), DM Sans (body, 300/400/500)
- No new CSS classes. All new elements use only existing classes present in index.html.

## Business Rules
- Status defaults to 'pending_verification' on insert. Only the Netlify Function updates it to 'report_sent'. No UPDATE code in the frontend.
- Supabase insert failure is silent — execution continues to signInWithOtp regardless of insert outcome.
- Page load handler runs on every page load: calls supabase.auth.getSession(). If a valid session is found, skip the welcome screen, restore state.userEmail from session.user.email, show "Report on its way" screen, call triggerReport().
- generatePDF() is removed entirely. jsPDF CDN tag removed from HTML. No browser-side PDF generation.
- AI intro: 3–4 sentences max. Inputs used: company_name, eligibility outcome, GHG inventory totals, target path name.
- Fixed sign-off script: hardcoded in the Netlify Function. Not AI-generated. Identical in every email.
- startOver() calls supabase.auth.signOut() plus full state reset before showWelcome().
- startAssessment() needs no validation — no input fields on the welcome screen in v3.0.
- Only two valid status values: 'pending_verification' and 'report_sent'.
- New elements on results screen use only existing CSS classes. No new classes added.

Out of scope — do not build:
- Re-sending the report on user request
- Users logging back in to access their report after the session ends
- Deduplication enforcement for multiple submissions from the same email
- Admin notification email to Zyad on new submission
- Admin panel (Supabase dashboard used directly)
- Newsletter signup automation
- Changes to Q1–Q10 screens, calibration screen, target selection screen, stop screens, or their logic
- PDF design changes (server-side PDF replicates current design exactly)
- Changes to any existing CSS

## Build State
Confirmed complete:
- Supabase schema created and confirmed — submissions table, RLS, and Auth tested (see docs/supabase-setup.md)
- GitHub repo connected to Netlify — auto-deploys from main
- Netlify environment variables added: SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY

Notes from supabase-setup.md — read before writing any Supabase code:
- No user_id on submissions. Row is inserted by anon before the magic link fires. Do not add a user_id field or reference auth.users.
- Email-based RLS: auth.jwt() ->> 'email' = email. Do not replace with auth.uid() = user_id.
- UPDATE policy exists for the Netlify Function only. No UPDATE code anywhere in the frontend.
- Netlify Function auth pattern: client retrieves access_token from supabase.auth.getSession() and sends it to /send-report via POST. Function initialises a Supabase client using that token — not a service role key.
- Confirm Resend sender domain is verified in Resend dashboard before any email testing.

Next:
Remove input fields (name, email, company, GDPR checkbox) from the welcome screen. Add the contact form section to the results screen: name field, email field, company name field, GDPR consent checkbox, data statement, error block, "Send my report →" button — using only existing CSS classes. Start here before touching any Supabase or function code (spec Section 8).

## Reference Docs
Claude Code reads these before building:
- `docs/product-spec.md` — full screen specs, function logic, email content, acceptance criteria
- `docs/supabase-setup.md` — confirmed table schema, field names in snake_case, RLS policies, auth config
