# NEXUS IDE — Spec & Implementation Plan

## Visione

Nexus e' un IDE multi-progetto che permette a sviluppatori, freelancer e agenzie di gestire piu' progetti nella stessa finestra, ciascuno con i propri provider AI, abbonamenti e contesto — con anteprima browser, terminale integrato e chat AI multiple simultanee.

**Differenziatore chiave:** ogni progetto ha il suo set di credenziali/abbonamenti AI. Un freelancer puo' usare Claude+Codex dell'agenzia su un progetto, e Claude+Gemini personali su un altro, nella stessa app.

---

## Architettura Target

```
┌──────────┬──────────────────────────────────────────┐
│ ToolBar  │  Project Switcher (tabs per progetto)     │
│ verticale├──────────────────────────────────────────┤
│          │                                          │
│ [Chat 1] │         Browser Preview                  │
│  header  │         (webview/iframe)                  │
│  body    │                                          │
│          │                                          │
│ [Chat 2] ├──────────────────────────────────────────┤
│  header  │  Tab bar (browser/devtools/altro)         │
│  body    ├──────────────────────────────────────────┤
│          │                                          │
│ [Chat N] │         Terminale                         │
│  header  │         (xterm.js + node-pty)             │
│  body    │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Principi di layout
- Tutti i confini tra sezioni sono **drag-resizable** (splitter draggabili)
- Le chat a sinistra sono un **accordion**: ogni header e' collassabile/espandibile
- Collassare una chat redistribuisce lo spazio alle altre aperte
- Non c'e' limite al numero di chat simultanee (scroll se necessario)
- Le dimensioni dei pannelli persistono in localStorage per progetto

---

## Modello dati

### Credential Vault
```typescript
interface Credential {
  id: string;
  providerType: "claude" | "codex" | "gemini" | "openai" | "grok" | "mistral" | "ollama";
  label: string;           // es: "Claude Pro (info@webagency.it)"
  email: string;           // account associato
  authMethod: "session" | "api_key" | "oauth";
  encryptedToken: string;  // salvato in Electron safeStorage
  color: string;           // colore header chat
}
```

### Profilo
```typescript
interface Profile {
  id: string;
  name: string;            // es: "Web Agency", "Personale"
  credentialIds: string[]; // credenziali abilitate in questo profilo
}
```

### Workspace
```typescript
interface Workspace {
  id: string;
  projectPath: string;     // working directory
  projectName: string;
  profileId: string;       // profilo credenziali attivo
  panelLayout: PanelSizes; // dimensioni pannelli salvate
  openChats: ChatSession[];
}
```

### ChatSession
```typescript
interface ChatSession {
  id: string;
  credentialId: string;    // quale credenziale usa
  providerType: string;
  collapsed: boolean;
  messages: Message[];
}
```

### ProjectContext (contesto condiviso)
```typescript
interface ProjectContext {
  workingDir: string;
  openFiles: string[];
  selectedText: string | null;
  terminalOutput: string;  // ultime N righe
  gitBranch: string;
  gitDiff: string;
  compressedContext: string | null; // output dello smistatore AI
  lastUpdated: number;
}
```

---

## Sistema di contesto condiviso

### Come funziona
Il contesto (file aperti, selezione, terminale, git) viene raccolto dall'app e allegato automaticamente ai messaggi delle chat. Non richiede AI — e' stato applicativo passato come parametri.

### Smistatore AI gratuito (ottimizzazione token)
Per ridurre il consumo di token sulle API a pagamento (~85% risparmio), un modello gratuito comprime il contesto in background:

- **Provider consigliato:** Gemini 2.0 Flash (gratis: 15 RPM, 1M token/giorno)
- **Fallback:** Ollama locale (totalmente offline, richiede ~4GB RAM)
- **Frequenza:** ogni 2 minuti o su cambio file/terminale
- **Funzionamento:** contesto grezzo (~2000 token) → smistatore → contesto compresso (~200 token)

```
File watcher + terminal → contesto grezzo
                              ↓
              Smistatore (Gemini Flash gratis / Ollama)
                              ↓
                     Contesto compresso (cache 2min)
                              ↓
              ChatSession[*] allega il contesto compresso
```

### Controllo utente
Toggle per tipo di contesto: `[✅ File] [❌ Terminale] [✅ Selezione] [❌ Git]`
Stima token mostrata prima dell'invio per API a consumo.

### Differenza per tipo abbonamento
- **Flat rate (Claude Pro, Codex):** contesto pieno, nessun costo extra, solo rate limit
- **API a consumo:** contesto compresso dallo smistatore, budget cap per progetto/giorno

---

## Fasi di implementazione

### FASE 1 — Layout Engine Resizable
**Priorita': CRITICA — sblocca tutto il resto**

**Cosa fare:**
- Integrare `react-resizable-panels` (libreria matura, ~8KB gzip)
- Creare layout a 3 zone: ToolBar | ChatPanel | MainPanel
- MainPanel diviso verticalmente: Preview (top) | Terminal (bottom)
- ChatPanel: container per l'accordion delle chat
- Tutti i bordi tra zone sono drag-resizable
- Persist dimensioni in localStorage per workspace
- Rimuovere il bug attuale: `PropertiesPanel.tsx` ha `min-w-[320px]` hardcoded che blocca il resize

**Bug da fixare (file: `ui/src/components/PropertiesPanel.tsx` linea 16):**
```tsx
// PRIMA (rotto):
<div className="w-80 flex-1 flex flex-col min-w-[320px]">

// DOPO: il sizing e' gestito dal panel system, non dal CSS
```

**File coinvolti:**
- `ui/src/components/Layout.tsx` — refactor completo del layout
- `ui/src/components/PropertiesPanel.tsx` — rimuovere constraint hardcoded
- Nuovo: `ui/src/components/PanelLayout.tsx` — wrapper react-resizable-panels
- Nuovo: `ui/src/components/ToolBar.tsx` — barra icone verticale

**Agente suggerito:** Diego (Frontend IDE Dev) — ha completato tutti i bugfix UX pannelli su Wren

---

### FASE 2 — Chat Stack (Accordion Multi-Provider)
**Priorita': ALTA**

**Cosa fare:**
- Componente `ChatStack` nel pannello sinistro
- Ogni chat = header collassabile + area messaggi + input
- Header colorato per provider (colore dalla credenziale)
- Click su header → toggle collapse/expand
- Collapse redistribuisce spazio alle chat aperte
- N chat illimitate (scroll verticale se servono piu' di quelle visibili)
- Ogni chat mantiene la propria sessione/storico

**File coinvolti:**
- Nuovo: `ui/src/components/ChatStack.tsx`
- Nuovo: `ui/src/components/ChatPanel.tsx` — singolo pannello chat
- Nuovo: `ui/src/components/ChatInput.tsx` — input con context toggles
- Nuovo: `ui/src/context/ChatSessionContext.tsx`

**Agente suggerito:** Diego (Frontend IDE Dev) per UI + Nicola (AI Integration Dev) per connessione provider

---

### FASE 3 — Credential Vault & Profili
**Priorita': ALTA**

**Cosa fare:**
- Electron main process: CRUD credenziali con `safeStorage`
- IPC handlers: `credentials:add`, `credentials:list`, `credentials:delete`
- UI gestione: pagina Settings con lista credenziali per provider
- Login OAuth per provider che lo supportano (Claude, Google/Gemini)
- Input API key per provider API-based (OpenAI, Mistral, Grok)
- Profili: raggruppamento credenziali, associazione a workspace

**File coinvolti:**
- `index.js` (Electron main) — IPC handlers + safeStorage
- Nuovo: `ui/src/pages/CredentialSettings.tsx`
- Nuovo: `ui/src/pages/ProfileSettings.tsx`
- Nuovo: `ui/src/api/credentials.ts` — client IPC

**Agente suggerito:** Alessandro (Tech Lead) per sicurezza + architettura vault

---

### FASE 4 — ProjectContext & Smistatore
**Priorita': MEDIA**

**Cosa fare:**
- File watcher nel main process (chokidar o fs.watch)
- Aggregatore contesto: file aperti, selezione, terminale, git
- Smistatore AI: Gemini Flash adapter per compressione contesto
- Cache contesto compresso (TTL 2 minuti)
- Fallback Ollama per uso offline/privacy
- Toggle contesto per-tipo nella UI chat

**File coinvolti:**
- `index.js` — file watcher + git status IPC
- Nuovo: `ui/src/services/contextManager.ts`
- Nuovo: `ui/src/services/contextCompressor.ts` — adapter Gemini/Ollama
- Estendere: adapter esistenti in `ui/src/adapters/`

**Agente suggerito:** Nicola (AI Integration Dev) per adapter + Alessandro (Tech Lead) per watcher

---

### FASE 5 — Browser Preview
**Priorita': MEDIA**

**Cosa fare:**
- Electron `<webview>` nel pannello centrale superiore
- Toolbar: URL bar, reload, back/forward, toggle devtools
- Navigazione sicura (sandbox, preload script)
- Comunicazione bidirezionale con l'app (postMessage)

**File coinvolti:**
- Nuovo: `ui/src/components/BrowserPreview.tsx`
- Nuovo: `ui/src/components/BrowserToolbar.tsx`
- `index.js` — webview security policy

**Agente suggerito:** Diego (Frontend IDE Dev)

---

### FASE 6 — Terminale Integrato
**Priorita': MEDIA**

**Cosa fare:**
- `xterm.js` nel pannello centrale inferiore
- `node-pty` nel main process per shell reale
- IPC: `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:output`
- Output condiviso con ProjectContext
- Supporto multiple terminal tabs

**File coinvolti:**
- Nuovo: `ui/src/components/TerminalPanel.tsx`
- `index.js` — node-pty spawn + IPC
- Nuovo: `ui/src/hooks/useTerminal.ts`

**Agente suggerito:** Alessandro (Tech Lead) per pty + Diego per UI

---

### FASE 7 — Project Switcher
**Priorita': BASSA (dopo le fondamenta)**

**Cosa fare:**
- Top bar con tabs per progetto aperto
- Ogni tab: nome progetto + colore + icone provider attivi
- Switch = cambia workspace (contesto, chat, layout)
- Persist workspace state per progetto

**File coinvolti:**
- Nuovo: `ui/src/components/ProjectSwitcher.tsx`
- Estendere: `ui/src/context/WorkspaceContext.tsx`

**Agente suggerito:** Diego (Frontend IDE Dev)

---

### FASE 8 — Auto-Update (hardening)
**Priorita': BASSA (gia' implementato, serve config)**

**Stato attuale:** electron-updater implementato in `index.js` (linee 1050-1090).
- `autoDownload: false`, `autoInstallOnAppQuit: true`
- IPC events funzionanti

**Cosa manca:**
- Configurazione publisher in `electron-builder.yml` (GitHub Releases o S3)
- UI notification nel renderer quando update disponibile
- Progress bar download
- "Installa e riavvia" button

**Agente suggerito:** Alessandro (Tech Lead) per config build + Diego per UI notification

---

## Stack tecnico

| Componente | Tecnologia |
|------------|-----------|
| Layout resizable | `react-resizable-panels` |
| Terminale | `xterm.js` + `node-pty` |
| Browser preview | Electron `<webview>` |
| Credential storage | Electron `safeStorage` |
| Smistatore contesto | Gemini Flash API (gratis) / Ollama |
| File watcher | `chokidar` |
| State management | React Context + localStorage persist |
| Chat routing | Adapter pattern (gia' esistente) |

## Gia' implementato e riusabile

- Electron shell + IPC (`index.js`) ✅
- Auto-updater (`electron-updater`) ✅
- Provider adapters (`adapters/claude-local`, `codex-local`, `gemini-local`) ✅
- Auth system ✅
- Company/project switching (CompanyRail) ✅
- 34/35 issue Wren completate (bugfix, security, build, onboarding) ✅

## Rischi e mitigazioni

| Rischio | Mitigazione |
|---------|------------|
| Performance N chat aperte | Virtualizzare chat collassate, lazy render |
| Smistatore dipende da API Google | Fallback Ollama locale |
| Privacy codice inviato a Gemini | Opzione "tutto locale" con Ollama |
| Complessita' layout nesting | react-resizable-panels gestisce nesting nativamente |
| Rate limit su abbonamenti flat | Contesto compresso riduce token per request |
