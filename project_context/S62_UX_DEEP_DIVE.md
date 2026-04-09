# S62 — UX Deep Dive: Issue Detail + Workflow Graph

> File dedicato. Non sovrascrive SESSION_HANDOFF.md.
> Creato dalla sessione S61 (dashboard fix, branch `fix/dashboard-bugs-and-ux`).

---

## Contesto

In S61 abbiamo risolto 15 problemi nella dashboard e nel flusso approvazione.
Il flusso **Dashboard → Inbox → Approva → CEO riparte** ora funziona.

Ma l'utente ha segnalato due aree ancora problematiche:

1. La **pagina dettaglio issue** (quando clicchi un task dall'inbox) non e' immediata, non ci si orienta, non si capisce cosa blocca
2. Il **grafo workflow** non spiega perche' gli agenti e i workflow sono bloccati

---

## COMPORTAMENTO DA ASSUMERE

### Chi sei in questa sessione

Devi comportarti simultaneamente come **tre figure professionali**:

1. **UX/UI Designer Senior** — Analizzi layout, gerarchia visiva, affordance, flow dell'utente. Ogni elemento ha un peso visivo: lo stai usando bene o stai sprecando attenzione su cose irrilevanti?

2. **Esperto di Neurolinguistica applicata alle interfacce** — Il cervello umano processa le informazioni in quest'ordine:
   - **Pre-attentivo** (< 200ms): colore, dimensione, posizione, movimento. L'utente NON legge — reagisce.
   - **Attentivo** (200ms-2s): legge titoli, badge, label. Cerca pattern familiari.
   - **Cognitivo** (> 2s): legge testo, interpreta dati, decide cosa fare.
   
   La tua domanda guida: *"L'informazione piu' importante arriva al cervello nella fase pre-attentiva o l'utente deve cercarla?"*

3. **Senior Developer** — Implementi le fix. Niente teoria senza codice. Ogni analisi deve produrre un cambiamento concreto nel codice.

### Metodo di lavoro (non negoziabile)

Per OGNI problema UX devi seguire questo ciclo:

```
STEP 1 — OSSERVA
  → Apri la pagina reale nel preview (preview_start + preview_eval per navigare)
  → Fai screenshot
  → NON leggere il codice prima. Guarda solo lo screenshot.
  → Scrivi cosa vede l'utente nei primi 3 secondi.
  → Scrivi cosa NON vede ma dovrebbe vedere.

STEP 2 — DIAGNOSTICA
  → Ora leggi il codice dei componenti coinvolti
  → Identifica il gap tra "cosa il codice mostra" e "cosa l'utente ha bisogno"
  → Classifica ogni friction point:
     - CRITICO: l'utente non sa cosa fare (manca il CTA)
     - ALTO: l'utente deve cercare l'informazione (gerarchia sbagliata)
     - MEDIO: l'utente capisce ma con sforzo inutile (terminologia, layout)
     - BASSO: brutto ma funzionale (estetica)

STEP 3 — PROGETTA
  → Per ogni friction point CRITICO e ALTO, scrivi la fix in linguaggio naturale
  → Esempio: "Aggiungere un banner amber sopra i tab che dice 'Questo task e' 
    in attesa della tua approvazione — [Approva] [Rifiuta]'"
  → Verifica che la fix rispetti il principio: l'azione necessaria deve 
    essere visibile nella fase pre-attentiva (< 200ms, colore + posizione)

STEP 4 — IMPLEMENTA
  → Scrivi il codice
  → Verifica nel preview con screenshot
  → Se non funziona, torna a STEP 1

STEP 5 — VALIDA
  → Fai screenshot finale
  → Confronta "prima" e "dopo"
  → L'utente ora capisce cosa fare nei primi 3 secondi? Se no, torna a STEP 3.
```

### Cosa NON fare

- Non leggere il codice prima di guardare lo screenshot
- Non proporre soluzioni senza implementarle
- Non fare analisi teoriche senza screenshot reali
- Non assumere che l'utente "capira'" — se deve pensare, hai sbagliato
- Non aggiungere complessita' (nuovi componenti, nuovi state) se basta riordinare/colorare/spostare

---

## TASK 1: Issue Detail Page — "Non capisco cosa devo fare"

### Il problema dell'utente

Dall'inbox clicco su un task (es. WEB-101 "Sviluppo App fridge", status `in_review`). Si apre la pagina di dettaglio. L'utente si perde:
- Non capisce immediatamente lo status
- Non sa se deve approvare, leggere l'output, o commentare
- I tab (Output/Briefing/Commenti/Attivita'/Sotto-attivita') non lo guidano
- L'output dell'agente e' sepolto dentro un tab

### Issue da testare

- `WEB-101` (in_review) — Smart Fridge
- `WEB-140` (in_review) — TrendLoot
- `WEB-160` (in_review) — Smart Fridge UI Redesign
- Qualunque issue `blocked` se presente

### Domande a cui rispondere (con screenshot)

1. Quando apro la pagina, cosa vedo above-the-fold? C'e' un CTA?
2. Lo status dell'issue e' evidente o devo cercarlo?
3. Se l'issue e' `in_review`, c'e' un bottone "Approva" visibile senza scrollare?
4. L'output dell'agente (il deliverable) e' immediatamente accessibile?
5. I tab sono nell'ordine giusto per un'issue che aspetta review?
6. Il thread di commenti mostra chiaramente chi ha detto cosa e quando?

### File coinvolti

- `ui/src/pages/IssueDetail.tsx` — pagina principale (~1500 righe)
- `ui/src/components/IssueReviewLayout.tsx` — layout per issue in review
- `ui/src/components/IssueResultsInline.tsx` — output agente inline
- `ui/src/components/IssueProperties.tsx` — pannello proprieta'
- `ui/src/components/CommentThread.tsx` — thread commenti

---

## TASK 2: Workflow Graph — "Perche' e' tutto bloccato?"

### Il problema dell'utente

L'utente guarda il grafo nella dashboard e vede nodi amber/rossi/viola. Ma non capisce:
- Perche' un workflow e' fermo
- Quale nodo specifico blocca il progresso
- Cosa deve fare per sbloccarlo
- Se il blocco e' un errore tecnico o un'attesa di approvazione

### Domande a cui rispondere (con screenshot)

1. Guardando un workflow con nodi bloccati, l'utente capisce in 3 secondi cosa fare?
2. L'header collassato del workflow dice qualcosa di utile sullo stato?
3. Quando faccio hover su un nodo, ottengo informazioni utili?
4. L'indicatore sull'edge (il cerchietto ?) e' abbastanza grande e chiaro?
5. Il popover che si apre cliccando l'edge ha abbastanza contesto?

### Cosa implementare

- **Tooltip hover sui nodi**: mostra lo status + da quanto tempo e' in quello stato + chi e' assegnato
- **Header workflow collassato migliorato**: "Bloccato: in attesa di approvazione su WEB-XXX" invece di solo "3 attivi"
- **Popover errore con "Rilancia"**: se un agente ha fallito, l'utente deve poter rilanciare con un click (usa `agentsApi.wakeup()`)
- **Visual priority**: i nodi che richiedono azione utente devono essere visivamente dominanti (piu' grandi? bordo piu' spesso? glow?)

### File coinvolti

- `ui/src/components/WorkflowGraph.tsx` — nodi, edge, popover, layout
- `ui/src/pages/Dashboard.tsx` — dati passati al grafo (failedIssueIds, activeRuns)

---

## Principi non negoziabili

- **Mai analizzare senza screenshot reali** — ogni fix deve partire da cosa vede l'utente
- **Ragiona come neurolinguista**: il cervello legge prima colore/posizione/dimensione, poi testo. I CTA devono essere pre-attentivi
- **Single point of action**: l'utente non deve cercare dove agire. L'azione deve essere visibile sopra la piega
- **Feedback immediato**: ogni azione deve produrre una conferma visiva entro 200ms
- **Verifica nel preview**: ogni modifica va testata nel browser prima del commit

---

## Branch

Continuare su `fix/dashboard-bugs-and-ux` o creare branch dedicato `fix/ux-issue-detail-graph`.

## Riferimenti S61

6 commit su `fix/dashboard-bugs-and-ux`:
- `380c46c1` — 8 bug fix (popover, polling, zoom, cache, orphan, keyframes)
- `ad2666d4` — Banner azione in dashboard
- `88bd8734` — Bottoni Approva/Rifiuta inbox per issue blocked/in_review
- `c4dda893` — CEO wakeup post-approvazione
- `b5ae3942` — Toast feedback
- `ed45ec08` — Session handoff
