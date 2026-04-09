# S62 — UX Deep Dive: Issue Detail + Workflow Graph

> File dedicato. Non sovrascrive SESSION_HANDOFF.md.
> Creato dalla sessione S61 (dashboard fix).

---

## Contesto

In S61 abbiamo risolto 15 problemi nella dashboard e nel flusso approvazione.
Il flusso **Dashboard → Inbox → Approva → CEO riparte** ora funziona.

Ma l'utente ha segnalato due aree ancora problematiche:

1. La **pagina dettaglio issue** (quando clicchi un task dall'inbox) non e' immediata, non ci si orienta, non si capisce cosa blocca
2. Il **grafo workflow** non spiega perche' gli agenti e i workflow sono bloccati

---

## TASK 1: Issue Detail Page — UX analysis + fix

### Problema

Quando l'utente clicca su un messaggio/task dall'inbox, la pagina di dettaglio issue non e' immediata. L'utente non si orienta e non capisce cosa blocca il task.

### Come affrontare (stessa metodologia usata in S61)

1. **Apri issue reali** (WEB-101, WEB-140, o una blocked) e fai screenshot
2. **Analizza come UX senior designer**: quali informazioni vede l'utente? In che ordine? Cosa manca?
3. **Analizza come esperto di neurolinguistica**: il cervello processa prima le informazioni pre-attentive (colore, posizione, dimensione). La pagina guida l'occhio verso l'azione necessaria?
4. **Identifica i friction points**:
   - L'utente capisce immediatamente lo status del task?
   - Sa cosa deve fare (approvare? leggere l'output? commentare?)?
   - L'output dell'agente e' facile da trovare e leggere?
   - I tab (Output/Briefing/Commenti/Attivita'/Sotto-attivita') sono nell'ordine giusto?
   - Il call-to-action e' visibile above-the-fold?
5. **Implementa fix concreti**: banner di stato, riordino tab, CTA in evidenza, semplificazione layout

### File coinvolti

- `ui/src/pages/IssueDetail.tsx` — pagina principale
- `ui/src/components/IssueReviewLayout.tsx` — layout per issue in review
- `ui/src/components/IssueResultsInline.tsx` — output agente
- `ui/src/components/IssueProperties.tsx` — pannello proprietà laterale
- `ui/src/components/CommentThread.tsx` — thread commenti

---

## TASK 2: Workflow Graph — analisi blocchi agenti

### Problema

L'utente guarda il grafo e non capisce PERCHE' un workflow e' bloccato. Vede nodi amber/rossi ma non sa la causa.

### Come affrontare

1. **Analizza i dati reali**: per ogni workflow visibile, qual e' lo stato dei subtask? Quali sono bloccati e perche'?
2. **Identifica il pattern**: i workflow si bloccano perche' il CEO non viene triggerato? Perche' un agente ha fallito? Perche' manca un'approvazione?
3. **Implementa "diagnosi visiva"**:
   - Nel grafo, aggiungere tooltip/hover che spieghi PERCHE' un nodo e' in quel stato
   - Nel header del workflow collassato, mostrare "Bloccato: in attesa di approvazione su WEB-XXX"
   - Aggiungere un bottone "Rilancia" nel popover errore che riprova l'esecuzione dell'agente
4. **Testare il flusso end-to-end**: crea un task → CEO crea subtask → approva → CEO riparte

### File coinvolti

- `ui/src/components/WorkflowGraph.tsx` — nodi, edge, popover
- `ui/src/pages/Dashboard.tsx` — dati passati al grafo

---

## Principi non negoziabili

- **Mai analizzare senza screenshot reali** — ogni fix deve partire da cosa vede l'utente
- **Ragiona come neurolinguista**: il cervello legge prima colore/posizione/dimensione, poi testo. I CTA devono essere pre-attentivi
- **Single point of action**: l'utente non deve cercare dove agire. L'azione deve essere visibile sopra la piega
- **Feedback immediato**: ogni azione deve produrre una conferma visiva entro 200ms
- **Verifica nel preview**: ogni modifica va testata nel browser prima del commit

---

## Branch

Continuare su `fix/dashboard-bugs-and-ux` oppure creare branch dedicato.

## Riferimenti S61

Commit della sessione precedente (6 commit su `fix/dashboard-bugs-and-ux`):
- `380c46c1` — 8 bug fix (popover, polling, zoom, cache, orphan, keyframes)
- `ad2666d4` — Banner azione in dashboard
- `88bd8734` — Bottoni Approva/Rifiuta inbox per issue blocked/in_review
- `c4dda893` — CEO wakeup post-approvazione + fix link /approvals
- `b5ae3942` — Toast feedback
- `ed45ec08` — Session handoff
