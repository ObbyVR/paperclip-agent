# Pixel Office v12 — Stanze specifiche per reparto

**Status:** DESIGN DOC — da eseguire in S68+
**Baseline:** v11.1 (commit `cb64b757` su `fix/dashboard-bugs-and-ux`)
**Scope founder (S67):** "+ che open space avrei creato stanze specifiche per reparti, magari con arredamento specifico in base alla funzionalità"

---

## Obiettivo

Trasformare il Pixel Office da **open space singolo con 5 desks allineati** a **ufficio multi-stanza** dove ogni reparto ha una stanza dedicata con arredamento funzionale specifico. Mantenere la scala 3D low-poly di v11.1 e l'atmosfera golden hour + bloom.

## Non-goals (fuori scope v12)

- Interni fotorealistici (resta low-poly cartoon)
- Multi-floor (tutto su un singolo piano)
- NPC con animazioni complesse oltre quelle esistenti (walking, talking, sitting)
- UI di navigazione tra stanze (la camera orbit basta, l'utente vede tutto dall'alto)

## Vision

Una top-down perspective dove l'utente vede 5-6 stanze sezionate da muri interni con aperture/porte. Ogni stanza ha:
- **Floor material distinto** (parquet warm, epoxy cold, carpet soft, concrete industrial)
- **Wall accent color** differente per reparto
- **Arredamento funzionale** che racconta cosa fa quel reparto
- **Lighting ambientale** coerente (CEO warm, Creative bright+colorful, Tech cool blue, Lab neutral+task)
- **Interior connection** via aperture nei muri — gli agenti camminano tra stanze attraverso portali reali

---

## Architettura tecnica

### Layout a grid

Stanza totale cresce da `22×12` (v11.1) a ~`28×18`. Divisa in 6 sotto-stanze via muri interni:

```
  (back wall z=-9)
  ┌────────────────┬─────────────┬──────────────┐
  │                │             │              │
  │   CEO OFFICE   │  CREATIVE   │  CREATIVE    │
  │   (4×6)        │  STUDIO     │  LAB         │
  │                │  (8×6)      │  (6×6)       │
  ├────────────────┴──────┬──────┴──────────────┤
  │                       │                     │
  │    LOUNGE             │     TECH LAB        │
  │    (10×6)             │     (8×6)           │
  │                       │                     │
  └───────────────┬───────┴─────────────────────┘
                  │                              ← window (+X wall)
  (front wall z=+9)
```

Tutte le stanze hanno apertura sul lato che confina con un corridoio o altra stanza. Porte NON hanno battenti (solo cutout nel muro per non complicare il rendering).

### Nuovi concetti in `officeLayout.ts`

```typescript
export interface RoomDef {
  id: string;
  label: string;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
  floorMaterial: "parquet-warm" | "epoxy-blue" | "carpet-gray" | "concrete";
  wallColor: string;
  ambientLight: { color: string; intensity: number };
  // Desks belonging to this room
  deskIds: string[];
  // Portals (door openings) to adjacent rooms
  portals: Array<{ toRoomId: string; position: Vec3; width: number }>;
}

export const ROOMS: RoomDef[] = [
  { id: "ceo-office", ... },
  { id: "creative-studio", ... },
  { id: "creative-lab", ... },
  { id: "tech-lab", ... },
  { id: "lounge", ... },
];
```

### Pathfinding multi-room

Il `computePath` attuale assume un singolo open space. In v12:

1. Per ogni coppia (roomA, roomB) precompile una lista di portal-sequences
2. `computePath(start, end)`:
   - Trova room di start e end (`pointInRoom(pos)`)
   - Se stessa room → A* semplice all'interno del room bounds
   - Se diverse room → route via sequenza di portali (BFS sul grafo delle stanze)
3. Ogni portale ha 2 waypoints: uno sul lato room-A, uno sul lato room-B (evita clipping con il muro)

Semplificazione v12: grafo delle stanze è piccolo (5 nodi, 4-5 edges), BFS basta.

### Nuovi file

- `ui/src/components/office3d/officeRooms.ts` — ROOMS def + pathfinding multi-room
- `ui/src/components/office3d/RoomWalls.tsx` — muri interni con cutout portali
- `ui/src/components/office3d/roomFurniture/CEOOffice.tsx`
- `ui/src/components/office3d/roomFurniture/CreativeStudio.tsx`
- `ui/src/components/office3d/roomFurniture/CreativeLab.tsx`
- `ui/src/components/office3d/roomFurniture/TechLab.tsx`
- `ui/src/components/office3d/roomFurniture/Lounge.tsx`
- `ui/src/components/office3d/FloorMaterials.ts` — makeParquetWarm/Epoxy/Carpet/Concrete

### File modificati

- `officeLayout.ts` — ROOM bounds, DESKS position (tutti dentro le nuove stanze), CORRIDORS sostituito con ROOMS + portals
- `AgentAI.ts` — `computePath` usa `pointInRoom` + BFS su portal graph
- `OfficeScene.tsx` — camera position più alta e arretrata, fov più largo per vedere tutte stanze
- `OfficeRoom.tsx` — rinominato a `OfficeShell.tsx`, delega muri interni a `RoomWalls`
- `OfficeFurniture.tsx` — orchestra i nuovi componenti room-specific
- `OfficeAgents.tsx` — `inferRoomId` aggiunto per assegnare agente a stanza corretta

---

## Arredamento per stanza (dettagli funzionali)

### CEO Office
- **Desk executive** in noce (2×1.1×0.85) con texture wood dark
- **2 poltrone Chesterfield** low-poly (cuscini capitonné stilizzati con box array)
- **Libreria a parete** back wall — boxes varie con dorsi libri colorati
- **Globo terrestre** su colonnina (sfera blue/green texture + stand ottone)
- **Lampada da tavolo ottone** — esistente CEOLamp spostata sul desk
- **Tappeto persiano** — plane con gradient texture warm
- **Quadro centrale** — 1 wall art large focale
- **Dept color wall:** `#3a2a1e` (dark walnut)

### Creative Studio (dept creative)
- **Desk open** lungo (6×1.2) con 4 seats, superficie chiara
- **Moodboard gigante** back wall — texture con sticker colorati sparsi
- **Cavalletto con tela** al centro — 2 travi inclinati + plane bianco
- **Tavolino luminoso** basso con emissive white (lightbox per sketch)
- **Sedie lounge colorate** — 2 poltroncine in angolo (fucsia, turchese)
- **Piante grandi** — 2 monstera stilizzate (grandi foglie plane)
- **Tappeto geometrico** — pattern emissive su plane
- **Dept color wall:** `#4a3460` (plum)

### Creative Lab (prototipazione)
- **Banco lavoro** (3×1×0.9) con superficie metal
- **Stampante 3D stilizzata** — box 0.4×0.5×0.4 con "testa" che si muove (subtle animation)
- **Proiettore a soffitto** — box nero con cone light a terra
- **Rack componenti** — 3×4 grid di box piccoli colorati a parete
- **Sgabelli alti** invece di sedie (2 cylinders)
- **Floor material:** concrete
- **Dept color wall:** `#2a3340` (steel blue)

### Tech Lab
- **4 desk** con monitor DOPPI (uno standard + uno verticale)
- **Whiteboard** back wall — plane bianco con "scribble" texture (sparse line marks)
- **Kanban board** — plane verde con 3 colonne ticks (post-it colorati)
- **Server rack** angolo — box alto 0.6×2×0.8 con LEDs emissive verticali (blink subtle)
- **Sedie ergonomiche** — 4 sedie con schienali alti black mesh texture
- **Floor material:** epoxy-blue (leggero riflesso)
- **Dept color wall:** `#1a2838` (navy)

### Lounge
- **Couch curvo** (2.5×0.7×0.9) — rimpiazza il couch dritto esistente
- **Coffee table** — esistente, spostato
- **Macchinetta caffè/frigo** — 2 box alti 0.6×1.2×0.5 con sportelli
- **Biliardino** (2×1×0.9) — tavolo verde con 2 file di omini
- **TV a muro** — box flat emissive con news texture
- **Piante tropicali** — 2 palm stylized (trunk + 5 fronds)
- **Tappeto grande shaggy** — plane con noise texture warm
- **Floor material:** carpet-gray
- **Dept color wall:** `#3a2a20` (cozy brown)

---

## DoD — Definition of Done v12

- [ ] typecheck clean (`pnpm --filter @paperclipai/ui exec tsc --noEmit`)
- [ ] build success (`pnpm --filter @paperclipai/ui build`)
- [ ] Visual: camera vede tutte le 5 stanze contemporaneamente
- [ ] Visual: ogni stanza ha almeno 3 pezzi di arredamento dedicati
- [ ] Functional: 18 agenti distribuiti nelle stanze per dept corretto
- [ ] Functional: un agente di Creative Studio che va in Lounge cammina ATTRAVERSO i portali (no clipping muri)
- [ ] Functional: CEO ambient walk visita il centro della CEO Office, non più ROOM_CENTER
- [ ] Performance: framerate non cala sotto 30fps con 18 agenti
- [ ] Bloom + skyline esistenti preservati
- [ ] AgentChatSheet preservato (click agente → sheet laterale)

## Anti-goals / rischi

- **Non rompere v11.1:** mantenere compatibilità del data shape Agent → Seat assignment
- **Camera overhead:** 18 agenti + arredamento denso + bloom potrebbe stressare GPU. Se fps < 30, ridurre agent cap a 15 o semplificare furniture geometry
- **Pathfinding bug:** un portal mal piazzato può bloccare il flow. Visual debug: rendere i portali come cubi semi-trasparenti visible solo durante dev
- **Scope creep:** la tentazione di aggiungere dettagli per ogni stanza è alta. Fermarsi al baseline di 3-5 oggetti per stanza, il polishing è v12.1

## Stima tempo

- Room layout + pathfinding (A): ~90 min
- CEO Office arredamento (B.1): ~30 min
- Creative Studio (B.2): ~30 min
- Creative Lab (B.3): ~25 min
- Tech Lab (B.4): ~30 min
- Lounge (B.5): ~25 min
- Camera + lighting tuning (C): ~30 min
- Build + smoke test + commit (D): ~20 min
- **Totale stimato:** ~4h — da spezzare in 2 sessioni Claude Pro se serve

## Strategia di esecuzione

**Se una sessione:**
1. A (90min) → B.1-B.2 (60min) → build check (5min) → B.3-B.5 (80min) → C (30min) → D (20min) ≈ 4h10m

**Se due sessioni (più sicuro):**
- **S68a:** A + B.1 (CEO Office) + B.2 (Creative Studio) + build check → commit intermedio
- **S68b:** B.3 + B.4 + B.5 + C + D → commit finale

## Alternative scartate

- **Stanze su più piani (2 piani)** — scope troppo grande per v12, richiede camera multipla o elevator animation
- **Portali con battenti di porta animati** — overhead per il pathfinding, i cutout nei muri bastano
- **Stanze generabili dinamicamente da data** — over-engineering, layout fisso va bene per demo

## Dipendenze nuove

Probabilmente nessuna. Tutte le feature sono ottenibili con i tool esistenti (three, drei, postprocessing).

---

**Ownership:** Next Claude session (S68) che legge questo file all'inizio.
**Branch strategia:** continuare su `fix/dashboard-bugs-and-ux` O creare `feat/pixel-office-v12-rooms` (decidere col founder a inizio S68).
