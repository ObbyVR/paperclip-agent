/**
 * Skill Security Scanner
 *
 * Analyzes skill content (SKILL.md and associated files) for potential
 * security risks including prompt injection, instruction override attempts,
 * and data exfiltration patterns.
 *
 * Trust levels:
 * - markdown_only: Low risk, still scanned for prompt injection
 * - assets: Medium risk, may contain embedded scripts
 * - scripts_executables: High risk, requires explicit approval
 */

import type { CompanySkillTrustLevel } from "@paperclipai/shared";

// ─── Types ──────────────────────────────────────────────────────────

export type SkillSecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SkillSecurityFinding {
  severity: SkillSecuritySeverity;
  category: string;
  description: string;
  line?: number;
  snippet?: string;
}

export interface SkillSecurityReport {
  skillKey: string;
  trustLevel: CompanySkillTrustLevel;
  scannedAt: string;
  overallRisk: "safe" | "low" | "medium" | "high" | "critical";
  findings: SkillSecurityFinding[];
  approved: boolean;
  summary: string;
}

// ─── Patterns ───────────────────────────────────────────────────────

interface SecurityPattern {
  pattern: RegExp;
  severity: SkillSecuritySeverity;
  category: string;
  description: string;
}

/**
 * Prompt injection patterns — attempts to override system instructions
 * or manipulate agent behavior through skill content.
 */
const PROMPT_INJECTION_PATTERNS: SecurityPattern[] = [
  // Direct instruction override
  {
    pattern: /(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|system|original)\s+(?:instructions?|prompts?|rules?|constraints?|guidelines?)/i,
    severity: "critical",
    category: "prompt_injection",
    description: "Attempts to override system instructions",
  },
  {
    pattern: /you\s+(?:are|must)\s+(?:now|actually|really)\s+(?:a|an)\s+(?:different|new)/i,
    severity: "critical",
    category: "prompt_injection",
    description: "Attempts to redefine agent identity",
  },
  {
    pattern: /(?:system\s*prompt|system\s*message|system\s*instruction)\s*(?:is|:|=)/i,
    severity: "high",
    category: "prompt_injection",
    description: "References or attempts to set system prompt",
  },
  {
    pattern: /\[(?:SYSTEM|INST|ADMIN)\]/i,
    severity: "high",
    category: "prompt_injection",
    description: "Uses special instruction tags that may confuse the model",
  },
  {
    pattern: /<<\s*(?:SYS|SYSTEM|INSTRUCTIONS?)\s*>>/i,
    severity: "high",
    category: "prompt_injection",
    description: "Uses XML-like system instruction delimiters",
  },
  {
    pattern: /(?:^|\n)\s*(?:Human|User|Assistant|System)\s*:/im,
    severity: "medium",
    category: "prompt_injection",
    description: "Contains role-play markers that may manipulate conversation flow",
  },
  // Jailbreak patterns
  {
    pattern: /(?:DAN|do\s+anything\s+now|jailbreak|bypass\s+(?:safety|filter|restriction))/i,
    severity: "critical",
    category: "jailbreak",
    description: "Contains known jailbreak patterns",
  },
  {
    pattern: /(?:pretend|imagine|roleplay|act\s+as\s+if)\s+(?:you\s+(?:have|are|can|don't\s+have))\s+(?:no\s+)?(?:restrictions?|limits?|rules?|filters?|guardrails?)/i,
    severity: "critical",
    category: "jailbreak",
    description: "Attempts to bypass safety restrictions via roleplay",
  },
];

/**
 * Data exfiltration patterns — attempts to leak sensitive data,
 * environment variables, secrets, or internal state.
 */
const DATA_EXFILTRATION_PATTERNS: SecurityPattern[] = [
  {
    pattern: /(?:print|output|show|reveal|display|leak|exfiltrate|send)\s+(?:all\s+)?(?:env(?:ironment)?|secret|api[_\s]?key|password|token|credential|private[_\s]?key)/i,
    severity: "critical",
    category: "data_exfiltration",
    description: "Attempts to extract sensitive credentials or secrets",
  },
  {
    pattern: /process\.env/i,
    severity: "high",
    category: "data_exfiltration",
    description: "References environment variables directly",
  },
  {
    pattern: /(?:curl|wget|fetch|http)\s+.*(?:webhook|ngrok|requestbin|pipedream|burpcollaborator)/i,
    severity: "critical",
    category: "data_exfiltration",
    description: "Attempts to send data to external collection endpoints",
  },
  {
    pattern: /(?:base64|btoa|encode)\s*\(.*(?:key|secret|token|password)/i,
    severity: "high",
    category: "data_exfiltration",
    description: "Attempts to encode sensitive data for exfiltration",
  },
];

/**
 * Command injection patterns — attempts to execute arbitrary commands
 * or access the filesystem in unauthorized ways.
 */
const COMMAND_INJECTION_PATTERNS: SecurityPattern[] = [
  {
    pattern: /(?:rm\s+-rf|chmod\s+777|dd\s+if=|mkfs|format\s+[a-z]:|shutdown|reboot)/i,
    severity: "critical",
    category: "destructive_command",
    description: "Contains potentially destructive system commands",
  },
  {
    pattern: /(?:\/etc\/passwd|\/etc\/shadow|~\/\.ssh|~\/\.aws|~\/\.gnupg)/i,
    severity: "high",
    category: "sensitive_path",
    description: "References sensitive system paths",
  },
  {
    pattern: /(?:eval|exec)\s*\(/i,
    severity: "medium",
    category: "code_execution",
    description: "Contains dynamic code execution patterns",
  },
  {
    pattern: /(?:nc\s+-l|netcat|ncat|socat)\s+/i,
    severity: "critical",
    category: "network_backdoor",
    description: "Attempts to open network listeners or reverse shells",
  },
];

/**
 * Privilege escalation patterns — attempts to gain unauthorized
 * permissions or access resources beyond the skill's scope.
 */
const PRIVILEGE_ESCALATION_PATTERNS: SecurityPattern[] = [
  {
    pattern: /(?:sudo|su\s+-|doas|runas)\s+/i,
    severity: "high",
    category: "privilege_escalation",
    description: "Attempts to escalate privileges",
  },
  {
    pattern: /(?:grant|give|assign)\s+(?:yourself|me|this\s+agent)\s+(?:admin|root|full|all)\s+(?:access|permissions?|privileges?)/i,
    severity: "critical",
    category: "privilege_escalation",
    description: "Attempts to self-grant elevated permissions",
  },
  {
    pattern: /(?:modify|change|update|edit)\s+(?:your|the)\s+(?:own\s+)?(?:permissions?|access|roles?|capabilities)/i,
    severity: "high",
    category: "privilege_escalation",
    description: "Attempts to modify own permissions or capabilities",
  },
];

const ALL_PATTERNS: SecurityPattern[] = [
  ...PROMPT_INJECTION_PATTERNS,
  ...DATA_EXFILTRATION_PATTERNS,
  ...COMMAND_INJECTION_PATTERNS,
  ...PRIVILEGE_ESCALATION_PATTERNS,
];

// ─── Scanner ────────────────────────────────────────────────────────

function scanContent(content: string, patterns: SecurityPattern[]): SkillSecurityFinding[] {
  const findings: SkillSecurityFinding[] = [];
  const lines = content.split("\n");

  for (const pat of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pat.pattern.test(lines[i])) {
        findings.push({
          severity: pat.severity,
          category: pat.category,
          description: pat.description,
          line: i + 1,
          snippet: lines[i].trim().slice(0, 120),
        });
      }
    }
    // Also check multi-line matches (for patterns spanning line breaks)
    if (pat.pattern.test(content)) {
      const alreadyFound = findings.some((f) => f.category === pat.category && f.description === pat.description);
      if (!alreadyFound) {
        findings.push({
          severity: pat.severity,
          category: pat.category,
          description: pat.description,
        });
      }
    }
  }

  return findings;
}

function computeOverallRisk(
  findings: SkillSecurityFinding[],
  trustLevel: CompanySkillTrustLevel,
): SkillSecurityReport["overallRisk"] {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";

  // scripts_executables trust level inherently raises risk
  if (trustLevel === "scripts_executables") {
    return findings.length > 0 ? "high" : "medium";
  }

  if (findings.some((f) => f.severity === "medium")) return "medium";
  if (findings.some((f) => f.severity === "low")) return "low";
  return "safe";
}

function generateSummary(
  skillKey: string,
  overallRisk: SkillSecurityReport["overallRisk"],
  findings: SkillSecurityFinding[],
  trustLevel: CompanySkillTrustLevel,
): string {
  if (overallRisk === "safe") {
    return `Skill "${skillKey}" (${trustLevel}) ha superato l'analisi di sicurezza senza problemi rilevati.`;
  }

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const categories = [...new Set(findings.map((f) => f.category))];

  const parts: string[] = [
    `Skill "${skillKey}" (${trustLevel}) — rischio: ${overallRisk.toUpperCase()}.`,
  ];

  if (criticalCount > 0) parts.push(`${criticalCount} problemi critici trovati.`);
  if (highCount > 0) parts.push(`${highCount} problemi ad alto rischio.`);
  parts.push(`Categorie: ${categories.join(", ")}.`);

  if (overallRisk === "critical" || overallRisk === "high") {
    parts.push("⚠️ ATTENZIONE: questa skill NON dovrebbe essere assegnata senza revisione umana.");
  }

  return parts.join(" ");
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Analyze a skill's content for security risks.
 * Returns a detailed report with findings, risk level, and approval status.
 */
export function analyzeSkillSecurity(
  skillKey: string,
  content: string,
  trustLevel: CompanySkillTrustLevel,
  additionalFiles?: Record<string, string>,
): SkillSecurityReport {
  const findings: SkillSecurityFinding[] = [];

  // Scan main SKILL.md
  findings.push(...scanContent(content, ALL_PATTERNS));

  // Scan additional files if present (scripts, assets, etc.)
  if (additionalFiles) {
    for (const [filePath, fileContent] of Object.entries(additionalFiles)) {
      const fileFindings = scanContent(fileContent, ALL_PATTERNS);
      for (const f of fileFindings) {
        f.description = `[${filePath}] ${f.description}`;
        findings.push(f);
      }
    }
  }

  // Trust level checks
  if (trustLevel === "scripts_executables") {
    findings.push({
      severity: "medium",
      category: "trust_level",
      description: "Skill contiene script eseguibili — richiede revisione umana prima dell'assegnazione",
    });
  }

  // Deduplicate findings
  const uniqueFindings = findings.filter((f, idx, arr) =>
    arr.findIndex((x) => x.category === f.category && x.description === f.description && x.line === f.line) === idx,
  );

  const overallRisk = computeOverallRisk(uniqueFindings, trustLevel);
  const approved = overallRisk === "safe" || overallRisk === "low";

  return {
    skillKey,
    trustLevel,
    scannedAt: new Date().toISOString(),
    overallRisk,
    findings: uniqueFindings,
    approved,
    summary: generateSummary(skillKey, overallRisk, uniqueFindings, trustLevel),
  };
}

/**
 * Quick check if a skill content is safe for automatic approval.
 * Returns true only if the content passes all security checks.
 */
export function isSkillContentSafe(content: string, trustLevel: CompanySkillTrustLevel): boolean {
  if (trustLevel === "scripts_executables") return false;
  const findings = scanContent(content, ALL_PATTERNS);
  return !findings.some((f) => f.severity === "critical" || f.severity === "high");
}

/**
 * Get a human-readable security assessment for display in the UI.
 */
export function getSecurityBadge(overallRisk: SkillSecurityReport["overallRisk"]): {
  label: string;
  color: "green" | "yellow" | "orange" | "red";
} {
  switch (overallRisk) {
    case "safe": return { label: "Sicura", color: "green" };
    case "low": return { label: "Rischio basso", color: "green" };
    case "medium": return { label: "Revisione consigliata", color: "yellow" };
    case "high": return { label: "Rischio alto", color: "orange" };
    case "critical": return { label: "Bloccata", color: "red" };
  }
}
