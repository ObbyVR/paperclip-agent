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

Generate a complete, single-file HTML5 redesign that looks like it was made by a top Italian digital agency. The output must make the prospect think "questo è quello che voglio per la mia attività."

## When to Use

- An issue is assigned with "redesign" in the title/description
- PAPERCLIP_WAKE_REASON contains "redesign"
- An audit report is available and the CEO wants a visual proposal

---

## Procedure

### Step 1: Gather Context

1. Read the issue description for the target URL and business name
2. Fetch the current site (`curl` or WebFetch) to extract: business name, address, phone, menu/services, any real photos
3. If an audit report exists for this site, read it for specific improvement areas
4. Determine the business category (ristorante, trattoria, pizzeria, hotel, ecc.)

---

### Step 2: Design Direction — Visual References

Use the following reference styles based on business type:

**Ristorante / Trattoria (categoria principale)**
- Riferimento visivo: Dribbble "restaurant website luxury Italy", "fine dining landing page dark"
- Mood: Elegante, caldo, evocativo. L'utente deve sentire profumo di cibo.
- Palette: Toni scuri (navy #0D1B2A o near-black #1A1208) + accenti oro/ambra (#C9954C o #D4A853) + crema (#F5EFE0)
- Font: `Cormorant Garamond` (titoli, peso 300-600, stile italic per i piatti) + `Inter` (body, peso 400-500)
- Layout: Full-viewport hero con overlay scuro + headline poetica, sezione menu con card visive, foto atmosfera
- DO: texture sottile, spaziatura generosa, bottoni CTA ghost-style, fotografie evocative
- DON'T: sfondo bianco piatto, font sans-serif generici per i titoli, menu come lista di testo

**Pizzeria / Casual**
- Palette: Rosso pomodoro (#C0392B) + bianco + nero + accento giallo (#F39C12)
- Font: `Oswald` (titoli, bold) + `Open Sans` (body)
- Mood: Energico, autentico, artigianale
- Layout: Hero con foto pizza in evidenza, menu a 2-3 colonne, CTA "Ordina ora"

**Hotel / Agriturismo**
- Palette: Verde salvia (#4A5E4A) + beige (#F0EAD6) + bianco + accento terracotta (#C4713F)
- Font: `Playfair Display` (titoli) + `Lato` (body)
- Mood: Naturale, autentico, ospitale, esperienziale
- Layout: Hero con panorama, sezione camere con card, esperienze/attività, "Prenota"

---

### Step 3: Immagini — Regole Critiche

**MAI usare placeholder generici.** Usa Unsplash con query ultra-specifiche per food photography:

Per ristoranti/trattorie:
```
https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80
https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80
https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=1200&q=80
https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80
https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&q=80
```

Per pizzerie:
```
https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80
https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=80
```

Per agriturismi/hotel rurali:
```
https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80
https://images.unsplash.com/photo-1501117716987-c8c394bb29df?w=1200&q=80
```

Usa `object-fit: cover` su tutti i container immagine. Hero background via `background-image` CSS con `background-size: cover`.

---

### Step 4: Sezione Menu — Standard Premium

Il menu è la sezione più importante per un ristorante. NON usare liste di testo.

**Struttura richiesta:**
- Titolo sezione: "Il Nostro Menu" o "La Cucina" con sottotitolo evocativo
- Tab o sezioni: Antipasti / Primi / Secondi / Dolci (o categorie rilevanti)
- Ogni voce = card con:
  - Nome piatto (Cormorant Garamond, italic, 18-20px)
  - Descrizione breve evocativa (max 2 righe, "Spaghetti alle vongole con pomodorini del Vesuvio e bottarga di muggine")
  - Prezzo allineato a destra (formato €XX,00)
  - Separatore sottile tra voci
- Background del menu: leggermente diverso dal resto (es. crema o pattern texture)

**Esempio HTML struttura voce menu:**
```html
<div class="menu-item">
  <div class="menu-item-header">
    <span class="dish-name">Spaghetti alle Vongole</span>
    <span class="dish-price">€16,00</span>
  </div>
  <p class="dish-description">Vongole veraci di Scilla, pomodorini, prezzemolo, vino bianco.</p>
</div>
```

---

### Step 5: Struttura HTML Completa

Sezioni obbligatorie nell'ordine:
1. **Nav** — logo + menu links sticky con scroll behavior
2. **Hero** — full-viewport, immagine di sfondo ad alto impatto, headline breve + poetica, CTA primaria
3. **Chi Siamo** — storia breve, immagine, tono caldo e personale
4. **Il Menu** — struttura premium come sopra
5. **Galleria** — 3-6 immagini in grid (food photography Unsplash)
6. **Dove Siamo** — indirizzo, orari, numero di telefono, link Google Maps
7. **Footer** — social icons, P.IVA, copyright

**Technical:**
- Self-contained (CSS inline nel `<style>`, no framework esterno)
- Google Fonts via CDN `<link>` in `<head>`
- Fully responsive (mobile-first, breakpoints 768px e 1024px)
- Smooth scroll, hover effects sottili su nav e CTA
- Target size: 20-50KB

---

### Step 6: Quality Check

Prima di postare verifica:
- [ ] Hero con immagine reale (non placeholder testo)
- [ ] Font Cormorant/Oswald/Playfair per i titoli (NON solo sans-serif)
- [ ] Menu con card strutturate e prezzi visibili
- [ ] Colori coerenti con la palette scelta (non bianco generico)
- [ ] Almeno 3 immagini Unsplash food-specific
- [ ] Mobile responsive (`@media` queries presenti)
- [ ] Lunghezza HTML > 15.000 caratteri
- [ ] `<body>` tag presente (non troncato)

---

### Step 7: Allega il File e Richiedi Approvazione

**7a. Allega l'HTML all'issue:**
```bash
curl -X POST "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/attachments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -F "file=@redesign.html;type=text/html"
```

**7b. Crea una richiesta di approvazione al founder:**
```bash
curl -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/approvals" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"approve_ceo_strategy\",
    \"requestedByAgentId\": \"$PAPERCLIP_AGENT_ID\",
    \"payload\": {
      \"title\": \"Redesign pronto: [NOME BUSINESS]\",
      \"description\": \"Redesign HTML5 generato. Rivedi e approva prima che Elena invii l'email di outreach.\",
      \"style\": \"[STILE USATO]\",
      \"sections\": \"[NUMERO SEZIONI]\"
    },
    \"issueIds\": [\"$PAPERCLIP_TASK_ID\"]
  }"
```

**7c. Imposta lo status dell'issue a `blocked` e commenta:**
```bash
curl -X PATCH "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "blocked"}'
```

Poi aggiungi un commento sull'issue:
```
Redesign completato ✅

- **Stile**: [nome preset]
- **Sezioni**: [lista sezioni]
- **Immagini**: [n] foto food Unsplash
- **Font**: [font usati]

In attesa di approvazione del founder prima di procedere con l'outreach email.
```

---

## Workflow Completo

```
Designer genera HTML
    → allega all'issue
    → crea approval request
    → imposta issue = blocked
    → commenta
Founder approva nella sidebar approvazioni
    → CEO sblocca Elena
    → Elena invia email outreach
```

**Il Designer NON deve mai impostare l'issue a `done` — lo fa il CEO dopo l'approvazione del founder.**
