# TODO NOW

## Wren IDE — Prossime priorità

### 1. Multi-chat accordion (PRIORITA' CRITICA)
- Refactorare `ChatPanel.tsx` in `ChatStack` con N sessioni simultanee
- Ogni chat: header collassabile (colore provider) + area messaggi + input
- "+ New Chat" → popup scelta provider (Anthropic/OpenAI/Gemini/Ollama) + credenziali
- Collapse/expand redistribuisce spazio
- Ogni chat mantiene la propria sessione

### 2. Pulsanti chiudi pannelli
- ✕ su chat panel per collassarlo
- ✕ su terminal per collassarlo  
- Click sulla toolbar per riaprirli

### 3. Fix tab bar / traffic lights
- La tab bar si sovrappone ai pallini macOS (titleBarStyle: "hiddenInset")
- Servono ~72px di padding-left sulla TabBar component

### 4. Fix resize chatbox
- Cancellare localStorage layout salvati che bloccano il resize
- Verificare che `collapsible` + `minSize={1}` funzionino correttamente

### 5. Fix electron-builder per build completa
- Le symlink pnpm non vengono risolte
- Opzioni: `node-linker=hoisted` oppure script post-build che risolve symlink
- Attualmente si usa workaround con repack asar manuale
