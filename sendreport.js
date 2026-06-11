// /send-report — generates the personalised SBTi SME report (AI intro + PDF) and
// emails it to the verified user, then flips the submission status to 'report_sent'.
//
// Auth model: the client sends its Supabase access_token (obtained after magic-link
// return). We initialise a Supabase client with that token — NOT a service role key —
// so the authenticated user's RLS policies apply server-side.

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const { jsPDF } = require('jspdf');

// Zyad's fixed sign-off — hardcoded, never AI-generated, identical in every email.
const SIGN_OFF = `One more thing.

The tool you just used? I built it from scratch — and I'm not a developer.

I'm a sustainability manager who knows SBTi inside out. At some point I decided that knowledge was worth more than a spreadsheet, so I used AI to turn it into something real: an assessment tool that captures your inputs, thinks through your situation, and lands a report in your inbox automatically.

I never thought I could build 1% of this. Yet here we are.

Your expertise can do the same thing.

If you want to learn how, this is where I teach it:
ailab.sustainos.io

Talk soon,
Zyad`;

const REPORT_FROM = 'SustainOS <hello@sustainos.io>';

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ─── PDF (server-side port of the v2 browser generatePDF, design unchanged) ──────
function buildPdf(companyName, a, targetLanguagePlain) {
  const opt = a.selectedOption;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 50;
  let y = margin;

  function addPage() { doc.addPage(); y = margin; }
  function checkY(needed = 30) {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) addPage();
  }

  // Header block (purple)
  doc.setFillColor(123, 47, 190);
  doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SBTi SME Readiness Assessment', margin, 30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${companyName}  ·  Generated ${new Date().toLocaleDateString('en-GB')}`, margin, 50);

  y = 90;
  doc.setTextColor(14, 11, 20);

  function sectionHeader(title) {
    checkY(30);
    doc.setFillColor(245, 240, 255);
    doc.rect(margin - 8, y - 12, W - margin * 2 + 16, 22, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(123, 47, 190);
    doc.text(title.toUpperCase(), margin, y);
    doc.setTextColor(14, 11, 20);
    y += 18;
  }

  function row(key, val) {
    checkY(20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(key + ':', margin, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(val), W - margin - 200);
    doc.text(lines, 240, y);
    y += lines.length * 13 + 4;
  }

  // Eligibility
  sectionHeader('1. Eligibility Proof');
  row('Sector', 'Not Oil & Gas or Financial Institution ✓');
  row('Subsidiary', a.q2_subsidiary === 'yes' ? 'Yes — SME/PE parent ✓' : 'Independent company ✓');
  row('Emission Threshold', `Below 10,000 tCO2e ✓ (S1+S2LB = ${(a.s1 + a.s2lb).toLocaleString()} tCO2e)`);
  row('SME Criteria Met', `${a.q4.length} of 4 criteria satisfied`);
  y += 10;

  // Inventory
  sectionHeader('2. GHG Inventory Sheet');
  row('Base Year', a.baseYear);
  row('Scope 1 (Direct)', a.s1.toLocaleString() + ' tCO2e');
  row('Scope 2 Location-Based', a.s2lb.toLocaleString() + ' tCO2e');
  row('Scope 2 Market-Based', a.s2mb !== null && a.s2mb !== undefined ? a.s2mb.toLocaleString() + ' tCO2e' : 'Not provided');
  row('Exclusions', a.exclusionPct > 0 ? a.exclusionPct + '%' : 'None');
  row('Scope 3 Status', a.q8scope3 === 'complete' ? 'Complete inventory' : 'Not complete / partial');
  row('Bioenergy', a.bioenergy === 'yes' ? 'Yes — reported separately' : 'No');
  y += 10;

  // Target
  sectionHeader('3. Selected Target');
  const optNames = { 1: 'Option 1 — Near-Term Targets (Standard Choice)', 2: 'Option 2 — Net-Zero Targets (Ambitious Choice)', 3: 'Option 3 — Maintenance Targets (Specific Choice)' };
  row('Target Path', optNames[opt]);
  if (opt === 1) {
    row('Target Year', a.targetYear);
    row('Minimum Ambition', `${a.ambition.toFixed(1)}% reduction from ${a.baseYear}`);
  } else if (opt === 2) {
    row('Near-Term Target Year', a.targetYearNT);
    row('Near-Term Min. Reduction', `${a.ambition.toFixed(1)}% from ${a.baseYear}`);
    row('Long-Term Target Year', a.targetYearLT + ' (≥90% reduction, Net-Zero)');
  } else {
    row('Target Year', a.targetYear);
    row('Commitment', `Maintain zero Scope ${a.s1 === 0 ? '1' : '2'} emissions`);
  }
  row('Submission Fee', a.feeDiscount ? '~$187.50 (85% discount — developing country <$10M revenue)' : '~$1,250 standard fee');
  y += 10;

  // Target Language (lime accent)
  sectionHeader('4. Official Target Language');
  y += 5;
  doc.setFillColor(250, 246, 255);
  const langLines = doc.splitTextToSize(targetLanguagePlain, W - margin * 2 - 20);
  doc.rect(margin - 4, y - 12, W - margin * 2 + 8, langLines.length * 13 + 16, 'F');
  doc.setDrawColor(200, 241, 53);
  doc.setLineWidth(3);
  doc.line(margin - 4, y - 12, margin - 4, y - 12 + langLines.length * 13 + 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(40, 20, 60);
  langLines.forEach(l => { doc.text(l, margin + 8, y); y += 13; });
  y += 20;
  doc.setTextColor(14, 11, 20);

  // Roadmap
  sectionHeader('5. Submission Roadmap');
  const steps = [
    ['Register', 'Create account on SBTi Validation Portal.'],
    ['Upload', 'Prepare proof of revenue/employees (e.g., annual report) to prove SME status.'],
    ['Submit', 'Copy data from this assessment into the "SME Science-Based Target Setting Form" on the portal.'],
    ['Pay', `Await invoice (${a.feeDiscount ? '~$187.50 with 85% discount' : 'approx. $1,250'}).`],
    ['Review', 'SBTi Due Diligence takes approximately 60 days.'],
    ['Report', 'Once approved, publish GHG inventory and progress annually.'],
  ];
  steps.forEach(([k, v], i) => row(`Step ${i + 1}: ${k}`, v));

  // Footer (company name + page numbers on every page)
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 140, 190);
    doc.text(`SBTi SME Assessment · ${companyName} · Page ${i} of ${pageCount}`, margin, doc.internal.pageSize.getHeight() - 25);
    doc.text('Generated via SBTi SME Readiness Tool · linkedin.com/in/zyad-hatquai/', W - margin, doc.internal.pageSize.getHeight() - 25, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// ─── AI intro (Anthropic, 500 token cap) ─────────────────────────────────────────
async function generateIntro(name, companyName, results) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const ghg = results.ghg_totals || {};
  const facts = [
    `Recipient name: ${name}`,
    `Company: ${companyName}`,
    `SBTi SME eligibility outcome: ${results.eligibility_outcome}`,
    `Scope 1 emissions: ${ghg.scope1} tCO2e`,
    `Scope 2 (location-based) emissions: ${ghg.scope2_location} tCO2e`,
    `Scope 3 status: ${ghg.scope3_status}`,
    `Selected target path: ${results.target_path_name}`
  ].join('\n');

  const system = `You write the opening of a personalised email accompanying a company's SBTi SME readiness report.

Output exactly this structure — nothing more:

One sentence greeting that addresses the recipient by name and states their eligibility outcome.

Then a blank line, then this exact line: "Here are your 3 key takeaways from the assessment:"

Then 3 numbered facts drawn strictly from their assessment data. Each fact must be one concise sentence. Reference specific figures — emissions totals, target path, or Scope 3 status — as given. Do not invent data.

Do not include a subject line, sign-off, signature, or any text outside this structure.`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 250,
    system,
    messages: [{ role: 'user', content: `Here is the assessment data:\n${facts}\n\nWrite the intro now.` }]
  });

  return msg.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
}

function buildHtml(bodyText) {
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withLink = escaped.replace(
    /ailab\.sustainos\.io/g,
    '<a href="https://ailab.sustainos.io">ailab.sustainos.io</a>'
  );
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;">${withLink.replace(/\n/g, '<br>')}</div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let accessToken;
  try {
    accessToken = JSON.parse(event.body || '{}').access_token;
  } catch (e) {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (!accessToken) return json(400, { error: 'Missing access_token' });

  // Authenticated Supabase client (user JWT, no service role key — RLS applies).
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData || !userData.user || !userData.user.email) {
      return json(401, { error: 'Invalid session' });
    }
    const userEmail = userData.user.email;

    // Fetch this user's pending submission (RLS already scopes to their own rows).
    const { data: rows, error: selErr } = await supabase
      .from('submissions')
      .select('*')
      .eq('email', userEmail)
      .eq('status', 'pending_verification')
      .order('created_at', { ascending: false })
      .limit(1);

    if (selErr) return json(500, { error: 'Could not read submission' });
    if (!rows || rows.length === 0) {
      // Nothing pending — already sent (idempotent) or no submission for this user.
      return json(200, { success: true, message: 'No pending submission' });
    }

    const row = rows[0];
    const companyName = row.company_name;
    const answers = row.assessment_answers || {};
    const results = row.assessment_results || {};
    const targetLanguage = results.target_language || '';

    // 1. AI intro
    const intro = await generateIntro(row.name, companyName, results);

    // 2. PDF (in memory)
    const pdfBuffer = buildPdf(companyName, answers, targetLanguage);
    const safeCompany = String(companyName).replace(/\s+/g, '_');

    // 3. Email (AI intro + fixed sign-off, PDF attached)
    const bodyText = `${intro}\n\n${SIGN_OFF}`;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailErr } = await resend.emails.send({
      from: REPORT_FROM,
      to: userEmail,
      subject: `Your SBTi SME Readiness Report — ${companyName}`,
      text: bodyText,
      html: buildHtml(bodyText),
      attachments: [{ filename: `SBTi_SME_Report_${safeCompany}.pdf`, content: pdfBuffer }]
    });
    if (emailErr) {
      console.error('Resend error:', emailErr);
      return json(502, { error: 'Email send failed' });
    }

    // 4. Flip status to report_sent (authenticated UPDATE allowed by RLS).
    const { error: updErr } = await supabase
      .from('submissions')
      .update({ status: 'report_sent' })
      .eq('email', userEmail)
      .eq('status', 'pending_verification');
    if (updErr) console.error('Status update error:', updErr);

    return json(200, { success: true, message: 'Report sent' });
  } catch (err) {
    console.error('send-report failed:', err);
    return json(500, { error: 'Internal error' });
  }
};

// Exported for unit testing of the (pure, side-effect-free) PDF builder.
exports.buildPdf = buildPdf;
