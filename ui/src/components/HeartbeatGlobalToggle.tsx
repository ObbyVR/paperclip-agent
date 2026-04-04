import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, HeartOff, Loader2 } from "lucide-react";
import type { InstanceSchedulerHeartbeatAgent } from "@paperclipai/shared";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function setAllHeartbeats(
  agents: InstanceSchedulerHeartbeatAgent[],
  enabled: boolean,
) {
  const targets = agents.filter((a) => a.heartbeatEnabled !== enabled);
  if (targets.length === 0) return targets;

  const results = await Promise.allSettled(
    targets.map(async (agentRow) => {
      const agent = await agentsApi.get(agentRow.id, agentRow.companyId);
      const runtimeConfig = asRecord(agent.runtimeConfig) ?? {};
      const heartbeat = asRecord(runtimeConfig.heartbeat) ?? {};
      await agentsApi.update(
        agentRow.id,
        {
          runtimeConfig: {
            ...runtimeConfig,
            heartbeat: { ...heartbeat, enabled },
          },
        },
        agentRow.companyId,
      );
    }),
  );

  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length > 0) {
    const detail =
      failures[0]?.reason instanceof Error
        ? failures[0].reason.message
        : "Unknown error";
    throw new Error(
      `Failed to update ${failures.length} of ${targets.length} agents: ${detail}`,
    );
  }
  return targets;
}

export function HeartbeatGlobalToggle() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.instance.schedulerHeartbeats,
    queryFn: () => heartbeatsApi.listInstanceSchedulerAgents(),
    refetchInterval: 15_000,
  });

  const enabledCount = useMemo(
    () => (agents ?? []).filter((a) => a.heartbeatEnabled).length,
    [agents],
  );
  const totalCount = agents?.length ?? 0;
  const anyEnabled = enabledCount > 0;

  const invalidateAll = async (rows: InstanceSchedulerHeartbeatAgent[]) => {
    const companies = new Set(rows.map((r) => r.companyId));
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.instance.schedulerHeartbeats,
      }),
      ...Array.from(companies, (cid) =>
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(cid) }),
      ),
      ...rows.map((r) =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.detail(r.id),
        }),
      ),
    ]);
  };

  const toggleMutation = useMutation({
    mutationFn: () => setAllHeartbeats(agents ?? [], !anyEnabled),
    onSuccess: (updated) => invalidateAll(updated),
  });

  // Don't render if no agents have heartbeat configured
  if (totalCount === 0) return null;

  const isPending = toggleMutation.isPending;
  const label = anyEnabled
    ? t("heartbeatToggle.disableAll")
    : t("heartbeatToggle.enableAll");
  const statusLabel = anyEnabled
    ? t("heartbeatToggle.activeCount", { count: enabledCount, total: totalCount })
    : t("heartbeatToggle.allOff");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 text-xs font-medium shrink-0 whitespace-nowrap ${
            anyEnabled
              ? "text-green-600 dark:text-green-400 hover:text-red-600 dark:hover:text-red-400"
              : "text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
          }`}
          disabled={isPending}
          onClick={() => toggleMutation.mutate()}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : anyEnabled ? (
            <Heart className="h-3.5 w-3.5 fill-current" />
          ) : (
            <HeartOff className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{statusLabel}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {toggleMutation.isError && (
          <span className="block text-destructive text-[10px]">
            {toggleMutation.error instanceof Error
              ? toggleMutation.error.message
              : t("failedToDisableHeartbeats")}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
