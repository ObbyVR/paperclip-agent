---
name: email-outreach
description: >
  Send outreach emails to prospects using audit reports and redesign
  previews. Use when the CEO assigns email outreach tasks, when an
  audit and/or redesign is ready to share with a prospect, or when
  the issue contains "email" or "contatta" in the title. Do NOT use
  for auditing sites (use web-audit) or generating redesigns
  (use html-redesign).
---

# Email Outreach Skill

Send professional outreach emails to prospects leveraging completed audits and redesigns.

## When to Use

- Issue contains "email", "contatta", "outreach" in title/description
- PAPERCLIP_WAKE_REASON contains "email" or "outreach"
- An audit report AND/OR redesign is ready for a prospect

## Prerequisites

- `RESEND_API_KEY` must be set in the environment
- Email templates available in `scripts/email-templates/`
- The prospect's email address must be known

## Email Templates

### Template: `audit`
Use when: audit is complete, no redesign yet.
Purpose: Provide free value (the audit), tease the redesign.
CTA: "Vuoi vedere come potrebbe essere il tuo nuovo sito?"

### Template: `redesign`
Use when: redesign is complete and protected.
Purpose: Show the prospect their potential new site.
CTA: "Rispondi a questa email per sapere tempi e costi."

## Procedure

### Step 1: Prepare the Content

1. Read the issue for prospect details: name, email, site URL, business name
2. If sending audit email: extract the top 3 findings from the audit report as a brief summary
3. If sending redesign email: ensure the HTML is protected (anti-inspect) and hosted/attached

### Step 2: Compose Variables

Prepare the template variables as JSON:

```json
{
  "nome": "Nome del prospect o del ristorante",
  "sito": "dominio.com",
  "agenzia": "Nome della nostra agenzia",
  "piva": "IT12345678901",
  "email_risposta": "info@nostraagenzia.com",
  "report": "1. Il sito non è responsive\n2. Manca una CTA chiara\n3. SEO non ottimizzato",
  "preview_url": "https://link-al-redesign-protetto.html"
}
```

### Step 3: Send the Email

```bash
npx tsx scripts/send-email.ts \
  --to prospect@email.com \
  --template audit \
  --vars '{"nome":"...","sito":"...","agenzia":"...","piva":"...","email_risposta":"...","report":"..."}'
```

Or for redesign:
```bash
npx tsx scripts/send-email.ts \
  --to prospect@email.com \
  --template redesign \
  --vars '{"nome":"...","sito":"...","agenzia":"...","preview_url":"...","piva":"...","email_risposta":"..."}'
```

### Step 4: Report Back

Post a comment on the issue confirming:
- Email sent to [address]
- Template used: [audit/redesign]
- Resend email ID: [id]

## Outreach Strategy

### Sequence (managed by CEO):
1. **Day 0:** Send audit email (free value, no ask)
2. **Day 3-5:** If no response, send redesign email (visual proof)
3. **Day 10:** If no response, no further contact (respect prospect's time)

### GDPR Compliance
- All emails include unsubscribe link (built into templates)
- Legitimate interest B2B (Art. 6(1)(f) GDPR) — communication between businesses
- Sender identification: agency name + P.IVA
- If prospect replies asking to stop → immediately stop, note in issue

### Tone Guidelines
- Professional but warm (not corporate robot)
- Italian language, formal "Lei" form
- Focus on VALUE delivered, not on selling
- Never say "offerta", "sconto", "gratis" — say "analisi", "proposta", "senza impegno"
- Subject line must be specific to their business (not generic)

## Error Handling

- If `RESEND_API_KEY` is missing: post comment "Email non inviata — API key Resend non configurata"
- If email bounces: post comment with error, don't retry
- If prospect email is unknown: post comment asking the CEO to provide it
