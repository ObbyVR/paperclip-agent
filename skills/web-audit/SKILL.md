---
name: web-audit
description: >
  Analyze a website and produce a structured audit report with scores.
  Use when assigned an issue containing a URL to audit, when the CEO
  delegates a site analysis task, or when preparing an audit before
  a redesign. Do NOT use for redesign generation (use html-redesign
  instead) or for email outreach (use email-outreach instead).
---

# Web Audit Skill

Produce a comprehensive, actionable audit of a website that can be sent to a prospect as a free value-add.

## When to Use

- An issue is assigned with a URL and "audit" in the title/description
- PAPERCLIP_WAKE_REASON contains "audit"
- The CEO asks you to analyze a site before redesign

## Procedure

### Step 1: Fetch the Website

Use WebFetch or `curl` to retrieve the homepage and key inner pages:
- Homepage
- About/Chi siamo
- Menu/Servizi/Prodotti (if applicable)
- Contatti

### Step 2: Analyze These Categories

Score each category 1-10 and provide specific findings:

1. **Design & UX** (layout, colors, typography, whitespace, mobile-friendliness)
2. **Contenuto** (copy quality, CTAs, value proposition clarity)
3. **SEO tecnico** (meta tags, headings structure, alt text, page speed indicators)
4. **Mobile** (responsive design, touch targets, viewport meta)
5. **Conversione** (clear CTAs, contact forms, booking/ordering ease)
6. **Branding** (logo quality, consistency, professional appearance)
7. **Performance** (page weight indicators, image optimization, external dependencies)

### Step 3: Produce the Report

Output a structured markdown report with this exact format:

```markdown
# Audit Sito Web — [dominio]

**Data:** [data]
**Analista:** SiteAuditor AI
**Punteggio complessivo:** [X/10]

## Sommario Esecutivo
[2-3 frasi con i punti chiave]

## Punteggi per Categoria

| Categoria | Punteggio | Priorità Fix |
|-----------|-----------|--------------|
| Design & UX | X/10 | 🔴/🟡/🟢 |
| Contenuto | X/10 | 🔴/🟡/🟢 |
| SEO Tecnico | X/10 | 🔴/🟡/🟢 |
| Mobile | X/10 | 🔴/🟡/🟢 |
| Conversione | X/10 | 🔴/🟡/🟢 |
| Branding | X/10 | 🔴/🟡/🟢 |
| Performance | X/10 | 🔴/🟡/🟢 |

## Analisi Dettagliata

### Design & UX
[Findings specifici con screenshots/evidenze]

### [Repeat per ogni categoria]

## Top 3 Miglioramenti Immediati
1. [Azione concreta con impatto atteso]
2. [Azione concreta con impatto atteso]
3. [Azione concreta con impatto atteso]

## Raccomandazione
[Breve pitch per il redesign — non aggressivo, orientato al valore]
```

### Step 4: Post the Report

Post the report as a comment on the issue that triggered this audit.

## Quality Standards

- Be honest but constructive — don't be unnecessarily harsh
- Every finding must be specific (not "the design could be better" but "the hero section lacks visual hierarchy — the heading and CTA compete for attention")
- Include the prospect's business context (a pizzeria needs menu visibility, a law firm needs trust signals)
- The report should provide enough value that the prospect says "these people understand my business"
