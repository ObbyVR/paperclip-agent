import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@/lib/router";
import {
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  Loader2,
  Pause,
  XCircle,
} from "lucide-react";
import { blueprintsApi } from "../api/blueprints";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BlueprintStepDef, BlueprintStepResult } from "@paperclipai/shared";

// ---------------------------------------------------------------------------
// Local JSON-Schema helpers (subset we actually use)
// ---------------------------------------------------------------------------
interface JsonSchemaProp {
  type?: string;
  title?: string;
  enum?: string[];
  default?: string;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

function isJsonSchema(v: unknown): v is JsonSchema {
  return typeof v === "object" && v !== null;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "---";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "---";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Status icons
// ---------------------------------------------------------------------------
const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  skipped: <Circle className="h-4 w-4 text-muted-foreground/40" />,
  paused: <Pause className="h-4 w-4 text-amber-500" />,
  cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
};

// ---------------------------------------------------------------------------
// InputStepForm — renders a dynamic form from paramsSchema
// ---------------------------------------------------------------------------
function InputStepForm({
  schema,
  defaultValues,
  isPending,
  onSubmit,
  onReject,
}: {
  schema: JsonSchema;
  defaultValues: Record<string, unknown>;
  isPending: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onReject: () => void;
}) {
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  const initialValues: Record<string, string> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const defVal = defaultValues[key];
    initialValues[key] =
      typeof defVal === "string" ? defVal : (prop.default ?? "");
  }

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  const isMultiline = (key: string) =>
    key.toLowerCase().includes("desc") || key.toLowerCase().includes("note");

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      {Object.entries(properties).map(([key, prop]) => {
        const isRequired = required.includes(key);
        const label = prop.title ?? key;

        if (prop.enum && prop.enum.length > 0) {
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={key} className="text-xs font-medium">
                {label}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Select
                value={values[key]}
                onValueChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
              >
                <SelectTrigger id={key} size="sm" className="w-full">
                  <SelectValue placeholder={`Seleziona ${label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {prop.enum.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (isMultiline(key)) {
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={key} className="text-xs font-medium">
                {label}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                id={key}
                required={isRequired}
                rows={3}
                className="text-sm resize-none"
                value={values[key]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [key]: e.target.value }))
                }
              />
            </div>
          );
        }

        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={key} className="text-xs font-medium">
              {label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={key}
              required={isRequired}
              className="h-8 text-sm"
              value={values[key]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
            />
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Conferma
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={onReject}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// StepRow
// ---------------------------------------------------------------------------
function StepRow({
  step,
  result,
  isCurrent,
  runPaused,
  defaultParams,
  onApprove,
  onReject,
  isPending,
}: {
  step: BlueprintStepDef;
  result?: BlueprintStepResult;
  isCurrent: boolean;
  runPaused: boolean;
  defaultParams: Record<string, unknown>;
  onApprove: (output?: Record<string, string>) => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const status = result?.status ?? "pending";
  const showActions = isCurrent && runPaused && !step.auto;
  const isInputStep = step.type === "input";
  const schema = isJsonSchema(step.paramsSchema) ? (step.paramsSchema as JsonSchema) : null;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-md transition-colors ${
        isCurrent
          ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
          : "bg-muted/30"
      }`}
    >
      <div className="flex-shrink-0 pt-0.5">{STATUS_ICON[status] ?? STATUS_ICON.pending}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{step.title}</span>
          <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {step.type}
          </span>
          {!step.auto && (
            <span className="text-[10px] uppercase text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
              review
            </span>
          )}
          {step.variants != null && step.variants > 1 && (
            <span className="text-[10px] text-violet-600 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded">
              {step.variants}×
            </span>
          )}
        </div>
        {step.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.description}</p>
        )}

        {/* Input step: render dynamic form */}
        {showActions && isInputStep && schema && Object.keys(schema.properties ?? {}).length > 0 && (
          <InputStepForm
            schema={schema}
            defaultValues={defaultParams}
            isPending={isPending}
            onSubmit={onApprove}
            onReject={onReject}
          />
        )}

        {/* Non-input review step: simple approve/reject buttons */}
        {showActions && !isInputStep && (
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              disabled={isPending}
              onClick={() => onApprove()}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Approva
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={onReject}
            >
              Rifiuta
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          {result?.costCents != null ? formatCost(result.costCents) : formatCost(step.costEstimateCents)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {result?.durationMs != null ? formatDuration(result.durationMs) : "---"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlueprintRunDetail page
// ---------------------------------------------------------------------------
export function BlueprintRunDetail() {
  const { t } = useTranslation();
  const { runId } = useParams<{ runId: string }>();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const { data: run, isLoading } = useQuery({
    queryKey: queryKeys.blueprints.runDetail(runId!),
    queryFn: () => blueprintsApi.getRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "paused" ? 3000 : false;
    },
  });

  const completeStepMutation = useMutation({
    mutationFn: ({
      stepId,
      status,
      output,
    }: {
      stepId: string;
      status: "completed" | "failed";
      output?: Record<string, string>;
    }) =>
      blueprintsApi.completeStep(runId!, stepId, {
        status,
        ...(output != null ? { output } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.blueprints.runDetail(runId!) });
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.blueprints", "Blueprints"), href: "/blueprints" },
      { label: run?.blueprint?.title ?? "Run" },
    ]);
  }, [setBreadcrumbs, t, run]);

  if (isLoading || !run) return <PageSkeleton />;

  const steps = [...(run.blueprint?.steps ?? [])].sort((a, b) => a.order - b.order);
  const runStatus = run.status;
  const defaultParams = (run.blueprint as unknown as { defaultParams?: Record<string, unknown> })?.defaultParams ?? {};

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{run.blueprint?.icon || "\u{1F4CB}"}</span>
          <div>
            <h1 className="text-xl font-semibold">{run.blueprint?.title}</h1>
            <p className="text-sm text-muted-foreground">
              Run #{run.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {STATUS_ICON[runStatus] ?? STATUS_ICON.pending}
          <span className="text-sm font-medium capitalize">{runStatus}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Progresso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              result={run.stepResults[step.id]}
              isCurrent={run.currentStepId === step.id}
              runPaused={runStatus === "paused"}
              defaultParams={defaultParams}
              onApprove={(output) =>
                completeStepMutation.mutate({ stepId: step.id, status: "completed", output })
              }
              onReject={() =>
                completeStepMutation.mutate({ stepId: step.id, status: "failed" })
              }
              isPending={completeStepMutation.isPending}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-md px-4 py-3">
        <span>
          Costo finora: <strong className="text-foreground">{formatCost(run.totalCostCents)}</strong>
        </span>
        <span>
          Durata: <strong className="text-foreground">{formatDuration(run.totalDurationMs)}</strong>
        </span>
        {run.startedAt && (
          <span>
            Avviato: <strong className="text-foreground">{new Date(run.startedAt).toLocaleString("it-IT")}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
