# CEO Console — Paperclip UI Redesign

**Date:** 2026-04-13
**Status:** Draft — pending founder approval
**Prototype:** `ui/prototypes/ceo-console-v3.html`

---

## Problem Statement

The current Paperclip UI has 19 pages with systemic visual noise issues:
- Task states (blocked/waiting/approved/done) are confusing — same status shown 2-3 times per screen
- Workflow graphs (WorkflowVisualizer) are broken and visually overwhelming
- Wall of text across Dashboard, Inbox (1243 lines), IssueDetail (1780 lines), AgentDetail (4110 lines)
- Developer metadata (adapter type, UUID, model strings) clutters founder-facing pages
- 6 inbox tabs + 3 category filters + red banner = triple-counted information
- Nested collapsibles up to 3 levels deep (RoundTable, Approvals)

The founder uses only 5 pages regularly: Dashboard, Inbox, Issues, Pixel Office, Costs.

## Design Direction

**"CEO Console"** — Reduce to 5 core pages with clear roles. Replace workflow lane graphs with a radial network graph (CEO-centric). Replace the approval flow with a Telegram-style chat mask.

**Aesthetic:** "Orbital Command" — deep space dark theme, Outfit + DM Sans typography, orbital ring animations, avatar-based agent nodes, living but not noisy.

## Architecture

### Navigation (3 levels, all collapsible)

1. **Sidebar** (left, 208px → 52px collapsed)
   - Dashboard, Inbox (with badge count), Issues, Pixel Office, Costs
   - Config section: Settings
   - Blueprints → accessed as sub-section of Projects (inner menu)
   - Routines → accessed as sub-section of Agent detail (mask tabs)

2. **Inner Menu** (200px, collapsible, contextual per page)
   - Dashboard: project list selector
   - Issues: filter/grouping controls
   - Costs: agent/project selector
   - Other pages: hidden

3. **Content Area** (main, fills remaining space)
   - Dashboard: radial graph
   - Inbox: 3-section scroll
   - Other pages: simplified views

### Pages

#### 1. Dashboard
- **Top bar:** Project name + 3 discrete KPIs (decisions pending, active tasks, cost today) + model tag
- **Main area:** Radial network graph
  - CEO node at center (indigo gradient, breathing rings)
  - Agent nodes arranged radially (single level, no drill-down)
  - Each node shows: avatar, name, role, current task label
  - Node border color = state (cyan=working, amber=needs approval, green=done, red=error, dim=idle)
  - Status dot on node (pulsing for live, ! for needs-me, checkmark for done)
  - Connection lines: dashed animated for live, amber for needs-me, subtle for done/idle
  - Travelling particle orbs on active connections
  - Orbital ring backgrounds for depth
- **Click on agent node → opens Interaction Mask**
- Absorbs: RoundTable, ProjectBoard (removed as standalone pages)

#### 2. Inbox
- **No tabs.** Single scroll with 3 visual sections:
  - **Urgente** (amber header) — items needing CEO decision. Each row: agent avatar, clear message ("Sara ha bisogno della tua approvazione"), subtitle, time, action button
  - **In corso** (cyan header) — informational updates. Same row format, no action button
  - **Archivio** (muted, collapsed by default) — completed items
- Click on urgent item → opens Interaction Mask
- Absorbs: Approvals, Activity (removed as standalone pages)

#### 3. Issues
- Simplified list with status icon, title, agent, project context
- Retains current IssuesList component but simplified row format
- No duplicate status rendering (one status indicator per row)

#### 4. Pixel Office
- Unchanged (Three.js scene, already approved)

#### 5. Costs
- Simplified from 5 tabs to single view with accordion sections
- Per-agent spend with expandable model breakdown
- Budget policy cards
- Date range picker simplified (presets only, no custom inputs)

### Interaction Mask (slide-in panel, 460px)

The primary interaction surface. Replaces IssueDetail for CEO decisions.

- **Header:** Agent avatar (large) + name + role + project context + model/cost tag (discrete)
- **Request banner:** Clear one-line message of what the agent needs ("Approva una delle 3 varianti di copy")
- **3 tabs:**
  - **Chat** — Telegram-style bubbles. Agent messages left (dark card), CEO messages right (indigo). Messages can contain:
    - Text with formatting
    - Output preview cards (thumbnail + "Apri nel browser ↗" link)
    - File pills (icon + name + size, clickable)
  - **Dettagli** — What approving unlocks (explanation card with left accent border), sub-task progress list (dot indicators), metrics (attempts, cost, model, time)
  - **File** — All shared files/outputs listed with icon, name, metadata, action button (open/download)
- **Action bar:** 3 buttons — Approva (green), Revisione (amber), Rifiuta (red)
- **Input:** Text field + send button

### Pages Removed / Absorbed

| Current Page | Destination |
|---|---|
| RoundTable | → Dashboard (graph replaces project report cards) |
| ProjectBoard | → Dashboard (graph shows blocked/decision states) |
| Approvals | → Inbox (urgent section) + Interaction Mask |
| ApprovalDetail | → Interaction Mask |
| Activity | → Inbox (in corso section) |
| OrgChart | → Settings sub-section |
| Blueprints | → Inner Menu sub-section under project |
| BlueprintRunDetail | → Interaction Mask (for active blueprint runs) |
| Routines | → Agent detail within Mask (tab) |
| RoutineDetail | → Agent detail within Mask |
| GoalDetail | → Settings or removed |
| Goals | → Settings or removed |
| CompanySkills | → Settings |
| CompanyExport/Import | → Settings |

### Status System (unified)

4 states only, with consistent visual treatment everywhere:

| State | Color | Node border | Dot | Meaning |
|---|---|---|---|---|
| Working | Cyan (#67e8f9) | Cyan + glow | Pulsing | Agent is executing |
| Needs me | Amber (#fcd34d) | Amber + glow | ! icon | CEO action required |
| Done | Green (#6ee7b7) | Green | ✓ icon | Completed |
| Error | Red (#fca5a5) | Red | Pulsing | Failed, needs attention |
| Idle | Dim border | None | None | No active work |

No more: backlog, todo, in_progress, in_review, blocked, cancelled as separate visual states on the graph. These map internally to the 4 states above.

### Broken Processes Found During Audit

These should be fixed in the existing codebase regardless of redesign:

1. **StatusBadge collision** — Same `StatusBadge` component used for issue statuses AND approval statuses with no visual differentiation. A "blocked" issue and a "rejected" approval render identically. (`IssueDetail.tsx:1379` vs `:1749`)

2. **False-done heuristic invisible** — Issues promoted to "richiesta" by `isFalseDoneLike()` (`inbox.ts:315`) look identical to genuinely blocked issues. No indicator that the system applied a heuristic.

3. **Description shown twice** — `extractObjectiveLine()` and `extractFirstRealParagraph()` in IssueDetail both extract from `issue.description`. Single-paragraph descriptions appear twice on screen. (`IssueDetail.tsx:1508-1521` and `:1532-1575`)

4. **Tabs inside tabs** — IssueDetail Attivita' tab wraps `IssueActivityTab` which itself is a `Tabs` component. (`IssueDetail.tsx:356-364`)

5. **Side panel auto-open** — GoalDetail opens GoalProperties side panel via `useEffect` on mount without user action. (`GoalDetail.tsx`)

6. **Dashboard fetches 200 runs every 15s** — `heartbeatsApi.list` with limit 200 polled every 15 seconds solely to build `failedIssueIds` for graph coloring. (`Dashboard.tsx`)

7. **Triple-counted inbox counts** — "N richieste" appears simultaneously in: category pill, red banner, and section header. (`Inbox.tsx:1053, :1117, :1165`)

## Technical Approach

- Create new page components in a separate directory (`ui/src/pages/v2/`)
- Reuse existing API layer, hooks, and data fetching
- New components: `NetworkGraph`, `InteractionMask`, `ChatBubble`, `OutputPreviewCard`, `FilePill`
- Feature flag or route prefix (`/v2/dashboard`) to keep old pages intact
- Migrate incrementally: Dashboard first, then Inbox, then simplify remaining pages

## Non-Goals

- No changes to server/API layer
- No changes to data model or database schema
- No changes to agent execution logic
- Avatar system improvements deferred to polish phase
- Mobile responsive deferred to after desktop approval

## Success Criteria

- Founder can identify all pending decisions within 3 seconds of opening Dashboard
- Approval flow: click agent → read request → approve/reject in under 10 seconds
- No status shown more than once per screen
- No developer metadata visible without explicit expand/click
- Page count reduced from 19 to 5 primary + settings
