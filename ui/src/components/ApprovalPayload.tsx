import { useTranslation } from "react-i18next";
import { UserPlus, Lightbulb, ShieldAlert, ShieldCheck, Clapperboard } from "lucide-react";
import { Link } from "@/lib/router";
import { formatCents } from "../lib/utils";

export function useTypeLabel(): Record<string, string> {
  const { t } = useTranslation();
  return {
    hire_agent: t("approval.typeHireAgent"),
    approve_ceo_strategy: t("approval.typeCeoStrategy"),
    budget_override_required: t("approval.typeBudgetOverride"),
    blueprint_step_input: "Blueprint — Compila brief",
    blueprint_step_review: "Blueprint — Review step",
  };
}

/** Fallback non-hook version for contexts where hooks can't be used */
export const typeLabel: Record<string, string> = {
  hire_agent: "Assunzione Agente",
  approve_ceo_strategy: "Strategia CEO",
  budget_override_required: "Sovrascrittura Budget",
  blueprint_step_input: "Blueprint — Compila brief",
  blueprint_step_review: "Blueprint — Review step",
};

/** Build a contextual label for an approval, e.g. "Hire Agent: Designer" */
export function approvalLabel(type: string, payload?: Record<string, unknown> | null): string {
  const base = typeLabel[type] ?? type;
  if (type === "hire_agent" && payload?.name) {
    return `${base}: ${String(payload.name)}`;
  }
  if (type === "approve_ceo_strategy" && payload?.title) {
    return String(payload.title);
  }
  if ((type === "blueprint_step_input" || type === "blueprint_step_review") && payload?.stepTitle) {
    return `Blueprint: ${String(payload.stepTitle)}`;
  }
  return base;
}

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  budget_override_required: ShieldAlert,
  blueprint_step_input: Clapperboard,
  blueprint_step_review: Clapperboard,
};

export const defaultTypeIcon = ShieldCheck;

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

function SkillList({ values }: { values: unknown }) {
  const { t } = useTranslation();
  if (!Array.isArray(values)) return null;
  const items = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">{t("approvalPanel.skills", "Skill")}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <p className="text-xs text-muted-foreground italic mb-2">{t("approval.newAiAgentRequest")}</p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{t("agentDetail.name", "Nome")}</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label={t("approvalPanel.role", "Ruolo")} value={payload.role} />
      <PayloadField label={t("agentDetail.title", "Titolo")} value={payload.title} />
      <PayloadField label="Icon" value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">{t("agentDetail.capabilities", "Capacita'")}</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{t("approvalPanel.adapter", "Adapter")}</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
      <SkillList values={payload.desiredSkills} />
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const plan = payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  const isRedesign = !!(payload.style || payload.sections);
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Titolo" value={payload.title} />
      {isRedesign && (
        <div className="flex flex-wrap gap-2 mt-1">
          {payload.style ? (
            <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Stile: {String(payload.style)}
            </span>
          ) : null}
          {payload.sections ? (
            <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {String(payload.sections)} sezioni
            </span>
          ) : null}
        </div>
      )}
      {!!plan && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(plan)}
        </div>
      )}
      {!plan && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function BudgetOverridePayload({ payload }: { payload: Record<string, unknown> }) {
  const budgetAmount = typeof payload.budgetAmount === "number" ? payload.budgetAmount : null;
  const observedAmount = typeof payload.observedAmount === "number" ? payload.observedAmount : null;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Ambito" value={payload.scopeName ?? payload.scopeType} />
      <PayloadField label="Finestra" value={payload.windowKind} />
      <PayloadField label="Metrica" value={payload.metric} />
      {(budgetAmount !== null || observedAmount !== null) ? (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Limite {budgetAmount !== null ? formatCents(budgetAmount) : "—"} · Osservato {observedAmount !== null ? formatCents(observedAmount) : "—"}
        </div>
      ) : null}
      {!!payload.guidance && (
        <p className="text-muted-foreground">{String(payload.guidance)}</p>
      )}
    </div>
  );
}

export function BlueprintStepInputPayload({ payload }: { payload: Record<string, unknown> }) {
  const runId = typeof payload.blueprintRunId === "string" ? payload.blueprintRunId : null;
  const stepTitle = typeof payload.stepTitle === "string" ? payload.stepTitle : null;
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Questo step richiede che tu compili un brief prima che il Blueprint possa continuare.
      </p>
      {stepTitle && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-20 shrink-0">Step</span>
          <span className="font-medium">{stepTitle}</span>
        </div>
      )}
      {runId && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-20 shrink-0">Run</span>
          <Link
            to={`/blueprint-runs/${runId}`}
            className="text-xs text-blue-500 hover:underline font-mono"
          >
            #{runId.slice(0, 8)} →
          </Link>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        Apri il run per compilare il form e continuare il workflow.
      </p>
    </div>
  );
}

export function BlueprintStepReviewPayload({ payload }: { payload: Record<string, unknown> }) {
  const runId = typeof payload.blueprintRunId === "string" ? payload.blueprintRunId : null;
  const stepTitle = typeof payload.stepTitle === "string" ? payload.stepTitle : null;
  const stepOutput = payload.stepOutput;
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Uno step automatico ha prodotto un risultato — verifica e approva per continuare.
      </p>
      {stepTitle && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-20 shrink-0">Step</span>
          <span className="font-medium">{stepTitle}</span>
        </div>
      )}
      {runId && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-20 shrink-0">Run</span>
          <Link
            to={`/blueprint-runs/${runId}`}
            className="text-xs text-blue-500 hover:underline font-mono"
          >
            #{runId.slice(0, 8)} →
          </Link>
        </div>
      )}
      {stepOutput != null && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-40">
          {JSON.stringify(stepOutput, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "budget_override_required") return <BudgetOverridePayload payload={payload} />;
  if (type === "blueprint_step_input") return <BlueprintStepInputPayload payload={payload} />;
  if (type === "blueprint_step_review") return <BlueprintStepReviewPayload payload={payload} />;
  return <CeoStrategyPayload payload={payload} />;
}
