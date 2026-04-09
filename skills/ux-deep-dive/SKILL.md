---
name: ux-deep-dive
description: Deep UX analysis and fix workflow — screenshot-driven, neurolinguistic, action-oriented. Analyzes real UI pages, identifies friction points systematically, implements fixes, and verifies in preview. Use when asked to "analyze UX", "improve this page", "fix the UX", or when reviewing any UI page for usability issues.
---

# UX Deep Dive — Analisi e Fix

## Quando usare questa skill

- L'utente chiede di analizzare, migliorare, o fixare la UX di una pagina
- L'utente dice "questa pagina non funziona", "non si capisce", "e' confusa"
- L'utente vuole un audit UX completo di una o piu' pagine
- Dopo aver implementato una feature UI, per verificare che l'esperienza sia buona

## Principi non negoziabili

1. **Mai analizzare senza screenshot reali** — ogni analisi parte da cosa vede l'utente nel browser
2. **Ragiona come neurolinguista**: il cervello processa prima le informazioni pre-attentive (colore, posizione, dimensione), poi il testo. I CTA devono essere pre-attentivi
3. **Single point of action**: l'utente non deve cercare dove agire. L'azione deve essere visibile sopra la piega
4. **Feedback immediato**: ogni azione deve produrre una conferma visiva entro 200ms
5. **Verifica nel preview**: ogni modifica va testata nel browser prima del commit

## Workflow

### Fase 1: Screenshot e Inventario

Per ogni pagina da analizzare:

1. Apri la pagina nel browser (preview dev server o Chrome MCP)
2. Fai screenshot della vista iniziale
3. Interagisci: clicca tab, apri pannelli, scrolla — fai screenshot di ogni stato
4. Annota cosa vede l'utente **dall'alto verso il basso** (gerarchia visiva)

### Fase 2: Analisi dei Friction Points

Per ogni screenshot, rispondi a queste domande:

**Pre-attentivo (< 100ms)**
- Dove cade l'occhio per primo? E' la cosa piu' importante?
- I colori comunicano lo stato correttamente? (verde=ok, rosso=errore, amber=attenzione)
- Le dimensioni guidano la gerarchia? (piu' grande = piu' importante)

**Orientamento (100ms - 1s)**
- L'utente capisce immediatamente in che pagina si trova?
- Lo status dell'elemento e' chiaro senza leggere?
- L'azione principale (CTA) e' visibile above-the-fold?

**Comprensione (1-5s)**
- L'utente sa cosa deve fare? (approvare? leggere? commentare?)
- Le informazioni sono nell'ordine di importanza?
- Ci sono elementi che non servono? (rumore visivo)

**Azione (5-30s)**
- Il percorso dall'informazione all'azione e' diretto?
- Ci sono click superflui prima di arrivare al contenuto utile?
- L'utente puo' completare il suo obiettivo senza scrollare/cercare?

### Fase 3: Classificazione

Crea una tabella dei problemi trovati:

| # | Problema | Gravita' | Fix proposto |
|---|----------|----------|--------------|
| 1 | ... | Alta/Media/Bassa | ... |

Ordina per gravita'. Implementa prima i fix ad alta gravita'.

### Fase 4: Pattern di Fix Comuni

**Tab vuoti come default**
- Smart default: se il tab di default e' vuoto, apri il primo tab con contenuto
- Nascondi tab completamente vuoti

**Informazioni tecniche troppo prominenti**
- Token count, hash ID, versioni: rendere compatti o nascondere
- Mostrare solo cio' che l'utente deve sapere per decidere

**Status non leggibili**
- Pallini colorati senza testo: aggiungere badge con label
- Status in inglese: tradurre nella lingua dell'utente

**CTA nascosti o assenti**
- Se l'utente deve agire (approvare, rifiutare), il CTA deve essere above-the-fold
- CTA primario (verde), secondario (outline), distruttivo (rosso) — gerarchia visiva

**Rumore nei feed/commenti**
- Entry tecniche (run succeeded, status change): ridurre a linea singola compatta
- Separare visivamente contenuto umano da log tecnici

**Properties panel**
- Nascondere campi vuoti ("No labels" → nascondere o placeholder discreto)
- Collassare informazioni ridondanti (3 date uguali → 1 data)

**Documenti e output**
- Se il titolo e' un key tecnico (es. "plan"), estrarre il titolo dal contenuto (primo H1)
- Mostrare sommario/riassunto prima del contenuto completo quando possibile

**Workflow/grafo**
- Nodi bloccati devono spiegare PERCHE' sono bloccati
- Header collassato deve mostrare contatori specifici per stato (non solo "X attivi")
- Badge diagnostici cliccabili con link diretto all'issue

### Fase 5: Implementazione

Per ogni fix:

1. Leggi il codice del componente coinvolto
2. Implementa il fix minimo necessario
3. Typecheck (`pnpm typecheck`)
4. Verifica nel browser con screenshot
5. Se ok, passa al fix successivo
6. Commit atomico per gruppo logico di fix

### Fase 6: Verifica Finale

1. Naviga tutte le pagine modificate
2. Verifica che non ci siano regressioni
3. Testa i flussi end-to-end (es. dashboard → badge → issue detail → approva)
4. Console errors check
5. Commit e push

## Anti-pattern da evitare

- **Mai proporre fix senza screenshot** — "potremmo migliorare X" senza averlo visto
- **Mai fixare l'estetica senza fixare la funzione** — il colore del bottone non conta se il bottone non c'e'
- **Mai aggiungere complessita'** — se un tab e' inutile, rimuovilo. Non aggiungere un toggle per nasconderlo
- **Mai analizzare solo la pagina singola** — l'utente arriva da qualche parte (inbox, dashboard) e va da qualche parte (dettaglio, azione). Analizza il FLUSSO
- **Mai ignorare lo stato vuoto** — la prima impressione di una pagina senza dati e' cruciale

## Metriche di successo

Un buon fix UX riduce almeno uno di questi:
- Tempo per capire lo stato di un elemento
- Click necessari per arrivare all'azione
- Carico cognitivo (tab, campi, informazioni inutili)
- Confusione ("cosa devo fare qui?")
