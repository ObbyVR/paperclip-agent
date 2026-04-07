import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { Clock, DollarSign, Layers, Play } from "lucide-react";
import { blueprintsApi } from "../api/blueprints";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BlueprintListItem } from "@paperclipai/shared";

function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "---";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "---";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function BlueprintCard({ bp, onRun }: { bp: BlueprintListItem; onRun: (id: string) => void }) {
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{bp.icon || "\u{1F4CB}"}</span>
            <div>
              <h3 className="font-semibold text-sm">{bp.title}</h3>
              {bp.category && (
                <span className="text-xs text-muted-foreground capitalize">{bp.category}</span>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">v{bp.version}</span>
        </div>

        {bp.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{bp.description}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {formatCost(bp.estimatedCostCents)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(bp.estimatedDurationMinutes)}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {bp.steps.length} step
          </span>
        </div>

        {bp.tags && bp.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bp.tags.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {bp.runCount > 0 ? `${bp.runCount} run` : "Mai eseguito"}
          </span>
          <Button size="sm" variant="default" onClick={() => onRun(bp.id)}>
            <Play className="h-3 w-3 mr-1" />
            Usa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Blueprints() {
  const { t } = useTranslation();
  const { company } = useCompany();
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.blueprints", "Blueprints") }]);
  }, [setBreadcrumbs, t]);

  const { data: blueprints, isLoading } = useQuery({
    queryKey: queryKeys.blueprints.list(company.id),
    queryFn: () => blueprintsApi.list(company.id, showAll),
  });

  const runMutation = useMutation({
    mutationFn: (blueprintId: string) => blueprintsApi.startRun(blueprintId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blueprints.list(company.id) });
      toast({ title: "Blueprint run avviato", variant: "default" });
      navigate(`/blueprint-runs/${run.id}`);
    },
    onError: () => {
      toast({ title: "Errore avvio run", variant: "destructive" });
    },
  });

  if (isLoading) return <PageSkeleton />;

  if (!blueprints || blueprints.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nessun Blueprint"
        description="I Blueprints sono workflow pre-costruiti e riusabili. Saranno disponibili qui una volta creati."
      />
    );
  }

  const categories = [...new Set(blueprints.map((bp) => bp.category).filter(Boolean))] as string[];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Blueprints</h1>
          <p className="text-sm text-muted-foreground">
            Workflow pre-costruiti, testati e tracciati per costi
          </p>
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={showAll ? "outline" : "default"}
            onClick={() => setShowAll(false)}
          >
            Tutti
          </Button>
          {categories.map((cat) => (
            <Button key={cat} size="sm" variant="outline" className="capitalize">
              {cat}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {blueprints.map((bp) => (
          <BlueprintCard
            key={bp.id}
            bp={bp}
            onRun={(id) => runMutation.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}
