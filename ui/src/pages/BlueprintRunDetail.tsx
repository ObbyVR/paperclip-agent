import { useEffect } from "react";
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
import type { BlueprintStepDef, BlueprintStepResult } from "@paperclipai/shared";

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

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  skipped: <Circle className="h-4 w-4 text-muted-foreground/40" />,
  paused: <Pause className="h-4 w-4 text-amber-500" />,
  cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
};

function StepRow({
  step,
  result,
  isCurrent,
  runPaused,
  onApprove,
  onReject,
  isPending,
}: {
  step: BlueprintStepDef;
  result?: BlueprintStepResult;
  isCurrent: boolean;
  runPaused: boolean;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const status = result?.status ?? "pending";
  const showActions = isCurrent && runPaused && !step.auto;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-md transition-colors ${
        isCurrent ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800" : "bg-muted/30"
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
        </div>
        {step.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.description}</p>
        )}
        {showActions && (
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              disabled={isPending}
              onClick={onApprove}
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
    mutationFn: ({ stepId, status }: { stepId: string; status: "completed" | "failed" }) =>
      blueprintsApi.completeStep(runId!, stepId, { status }),
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
              onApprove={() => completeStepMutation.mutate({ stepId: step.id, status: "completed" })}
              onReject={() => completeStepMutation.mutate({ stepId: step.id, status: "failed" })}
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
