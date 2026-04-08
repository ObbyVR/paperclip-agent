# Session Optimizer

## Modello suggerito
Per lavoro su Wren (Electron + React + TypeScript): **Opus** per refactoring strutturali, **Sonnet** per fix puntuali e CSS.

## Vincoli sessione
- Il sorgente Wren è in `/Users/valeriorullo/Downloads/GitHub/wren/`
- Node non è nel PATH standard. Usa: `export PATH="/opt/homebrew/lib/python3.11/site-packages/playwright/driver:$PATH"`
- pnpm: `export PNPM_HOME="/Users/valeriorullo/Library/pnpm" && export PATH="$PNPM_HOME:$PATH"`
- electron-builder NON funziona con pnpm symlinks. Usa repack asar manuale.
- Il backup asar funzionante è in `/Applications/Wren.app/Contents/Resources/app.asar`
- Solo il renderer viene sostituito nel repack

## Flusso di deploy rapido
```bash
export PNPM_HOME="/Users/valeriorullo/Library/pnpm"
export PATH="$PNPM_HOME:/opt/homebrew/lib/python3.11/site-packages/playwright/driver:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/wren
pnpm --filter @wren/renderer build
# Poi usa lo script Python di repack (vedi SESSION_HANDOFF.md)
pkill -f Wren; sleep 1
cp /tmp/wren-vN.asar /Applications/Wren.app/Contents/Resources/app.asar
open /Applications/Wren.app
```

## Mentalità critica
- NON modificare file nel main process (index.js, ai-handlers.js) — troppo rischio di rompere il require chain
- Lavorare SOLO sul renderer (UI) e fare repack dell'asar con il backup come base
- Testare sempre con `/Applications/Wren.app/Contents/MacOS/Wren 2>&1` per vedere errori
- Fare checkpoint git PRIMA di ogni modifica grande
