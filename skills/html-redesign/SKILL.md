---
name: html-redesign
description: >
  Generate a complete, professional HTML redesign of a website.
  Use when assigned an issue containing a URL to redesign, when
  the CEO delegates a redesign task, or after a web-audit has
  been completed. Do NOT use for audits (use web-audit) or for
  emailing prospects (use email-outreach).
---

# HTML Redesign Skill

Generate a complete, single-file HTML5 redesign that looks professional enough to impress a prospect.

## When to Use

- An issue is assigned with "redesign" in the title/description
- PAPERCLIP_WAKE_REASON contains "redesign"
- An audit report is available and the CEO wants a visual proposal

## Procedure

### Step 1: Gather Context

1. Read the issue description for the target URL and any style preferences
2. If an audit report exists for this site, read it for specific improvement areas
3. Determine the business category (restaurant, hotel, law firm, etc.)

### Step 2: Select Design Preset

Run the design preset selector to get style guidelines:

```bash
npx tsx scripts/get-design-preset.ts --match "[business type]"
```

This returns: palette, fonts, layout, mood, sections, do/dont guidelines.
Use these as your design foundation.

### Step 3: Fetch Current Site

Use WebFetch or curl to retrieve the current site content:
- Extract: business name, address, phone, menu items, services, photos
- Note: what works (keep it) and what needs improvement

### Step 4: Generate the HTML

Create a single-file HTML5 document with these requirements:

**Technical:**
- Self-contained (inline CSS, no external dependencies except Google Fonts CDN)
- Fully responsive (mobile-first, breakpoints at 768px and 1024px)
- Use Tailwind-style utility classes OR clean inline styles
- Include viewport meta tag
- Total size: aim for 15-30KB (excluding images)

**Design:**
- Follow the design preset palette, fonts, and mood
- Hero section with business name and primary CTA
- All sections from the preset's `sections` array
- Professional typography with proper hierarchy (h1 > h2 > h3)
- Adequate whitespace and visual breathing room
- Smooth scroll behavior

**Content:**
- Use REAL content from the current site (not lorem ipsum)
- Improve copy where needed (clearer CTAs, better headlines)
- Include all essential business info (address, phone, hours)
- Add placeholder comments for images: `<!-- IMAGE: description of what goes here -->`

**Fonts:**
- Use Google Fonts via CDN link in `<head>`
- Load only the weights you use (400, 600, 700 typical)

### Step 5: Quality Check

Before posting, verify:
- [ ] HTML is valid (no unclosed tags)
- [ ] Mobile responsive (check with `@media` queries)
- [ ] All business info is accurate
- [ ] CTA buttons are visible and functional
- [ ] Colors match the design preset
- [ ] Total length > 10,000 characters (indicates completeness)
- [ ] `<body>` tag exists (not truncated)

### Step 6: Post the Result

Post the complete HTML as a comment on the issue.
Include a brief summary: "Redesign generato per [sito] — stile: [preset name], [X] sezioni, responsive."

## After Generation

The CEO or human operator can then:
1. Protect the HTML: `npx tsx scripts/protect-html.ts redesign.html protected.html --agency "Nome"`
2. Send to prospect: `npx tsx scripts/send-email.ts --to prospect@email --template redesign --vars '{"preview_url":"..."}'`

## Quality Standards

- The redesign must look **significantly better** than the original
- It should be "wow, this looks like a real agency did it"
- Focus on the business's core conversion goal (reservations for restaurants, appointments for salons, etc.)
- Don't over-design — clean and professional beats flashy
