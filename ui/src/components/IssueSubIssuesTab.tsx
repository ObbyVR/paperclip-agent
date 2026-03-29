import { useTranslation } from "react-i18next";
import { useLocation } from "@/lib/router";
import { TabsContent } from "@/components/ui/tabs";
import { Link } from "@/lib/router";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import type { Agent, Issue } from "@paperclipai/shared";

type Props = {
  childIssues: Issue[];
  agentMap: Map<string, Agent>;
};

export function IssueSubIssuesTab({ childIssues, agentMap }: Props) {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <TabsContent value="subissues">
      {childIssues.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("issueDetail.noSubIssues")}</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {childIssues.map((child) => (
            <Link
              key={child.id}
              to={`/issues/${child.identifier ?? child.id}`}
              state={location.state}
              className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/20 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <StatusIcon status={child.status} />
                <PriorityIcon priority={child.priority} />
                <span className="font-mono text-muted-foreground shrink-0">
                  {child.identifier ?? child.id.slice(0, 8)}
                </span>
                <span className="truncate">{child.title}</span>
              </div>
              {child.assigneeAgentId && (() => {
                const name = agentMap.get(child.assigneeAgentId)?.name;
                return name
                  ? <Identity name={name} size="sm" />
                  : <span className="text-muted-foreground font-mono">{child.assigneeAgentId.slice(0, 8)}</span>;
              })()}
            </Link>
          ))}
        </div>
      )}
    </TabsContent>
  );
}
