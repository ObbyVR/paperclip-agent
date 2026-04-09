-- S61: Assign 9 standalone agents (direct CEO reports) to sub-departments
-- CEO: Marco — CEO (reportsTo = NULL)
-- Department leaders (already have reports):
--   Lorenzo — Direttore Ricerca (has Luca Analista, Sara)
--   Andrea — Direttore Creativo (has Filippo, Giulia)
--   Carla — Ecommerce Manager (has Elena)
-- New department leader:
--   Alessandro — Tech Lead (gets Diego, Nicola, Luca B&B, Davide)

-- ═══ TECH DEPARTMENT (Alessandro — Tech Lead) ═══

-- Diego — Frontend IDE Dev → Tech
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Alessandro — Tech Lead%' LIMIT 1
)
WHERE name LIKE 'Diego — Frontend IDE Dev%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- Nicola — AI Integration Dev → Tech
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Alessandro — Tech Lead%' LIMIT 1
)
WHERE name LIKE 'Nicola — AI Integration Dev%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- Luca — B&B Full-Stack Dev → Tech
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Alessandro — Tech Lead%' LIMIT 1
)
WHERE name LIKE 'Luca — B&B Full-Stack Dev%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- Davide — Video & Publishing Engineer → Tech
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Alessandro — Tech Lead%' LIMIT 1
)
WHERE name LIKE 'Davide — Video%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- ═══ DESIGN/CREATIVE DEPARTMENT (Andrea — Direttore Creativo) ═══

-- Sofia — DesignResearcher → Creative
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Andrea — Direttore Creativo%' LIMIT 1
)
WHERE name LIKE 'Sofia — DesignResearcher%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- Matteo — WebDesigner → Creative
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Andrea — Direttore Creativo%' LIMIT 1
)
WHERE name LIKE 'Matteo — WebDesigner%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- ═══ RESEARCH DEPARTMENT (Lorenzo — Direttore Ricerca) ═══

-- Marco — MarketResearcher → Research
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Lorenzo — Direttore Ricerca%' LIMIT 1
)
WHERE name LIKE 'Marco — MarketResearcher%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);

-- ═══ ECOMMERCE/CONTENT (Carla — Ecommerce Manager) ═══

-- Chiara — CopyWriter → Ecommerce/Content
UPDATE agents SET reports_to = (
  SELECT id FROM agents WHERE name LIKE 'Carla — Ecommerce Manager%' LIMIT 1
)
WHERE name LIKE 'Chiara — CopyWriter%'
  AND reports_to = (SELECT id FROM agents WHERE name LIKE 'Marco — CEO%' LIMIT 1);
