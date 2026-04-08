# Decisions Log

## 2026-04-08 — S49: Wren Layout Refactor

### D1: Layout AI-first
**Decisione**: Chat AI a sinistra come pannello principale, editor/terminal a destra.
**Motivazione**: L'utente interagisce primariamente via AI chat, non browsing file.
**Alternativa scartata**: File tree nel pannello centrale (layout classico IDE).

### D2: File tree come overlay sidebar
**Decisione**: Il file tree non è nel layout principale. Si apre come overlay (position:absolute) cliccando 📁 nella toolbar.
**Motivazione**: AI-first paradigm. I file si gestiscono via chat.

### D3: Toolbar verticale separata dalla chat
**Decisione**: Colonna toolbar (40px) separata a sinistra, poi chat panel.
**Motivazione**: L'utente ha esplicitamente richiesto che toolbar e chat siano colonne distinte.

### D4: Toolbar order — tools in alto, settings in basso
**Decisione**: 📁/◉/⎇ (workspace tools) in alto, $/⚙ (settings/billing) in basso.
**Motivazione**: Richiesta esplicita dell'utente.

### D5: "+ New Chat" unito a scelta provider
**Decisione**: Il pulsante per creare una nuova chat deve far scegliere quale AI e credenziali usare.
**Motivazione**: Unifica login/abbonamento con creazione chat. Un solo flusso.

### D6: Tutti i pannelli collapsible con minSize=1
**Decisione**: Ogni pannello può essere ridimensionato liberamente fino a collassarsi.
**Motivazione**: Richiesta esplicita — "tutto deve essere libero, min width 10px".

### D7: Deploy via repack asar manuale
**Decisione**: Build solo renderer con pnpm, poi repack asar usando il backup come base e sostituendo solo i file renderer.
**Motivazione**: electron-builder non risolve le symlink pnpm. Workaround temporaneo fino a fix del build pipeline.

### D8: Badge "ANT" = prime 3 lettere del provider
**Decisione**: Documentato, non un bug. ANT=Anthropic, OPE=OpenAI, GEM=Gemini, OLL=Ollama.
