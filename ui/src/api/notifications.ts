import { api } from "./client";

export interface Notification {
  id: string;
  companyId: string;
  userId: string | null;
  type: string;
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  agentId: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  dismissedAt: string | null;
  escalatedAt: string | null;
  escalationCount: number;
  createdAt: string;
}

export interface NotificationCounts {
  critical: number;
  high: number;
  medium: number;
  info: number;
  total: number;
}

export const notificationsApi = {
  list: (companyId: string, opts?: { includeRead?: boolean; includeDismissed?: boolean; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.includeRead) params.set("includeRead", "true");
    if (opts?.includeDismissed) params.set("includeDismissed", "true");
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return api.get<Notification[]>(`/companies/${companyId}/notifications${qs ? `?${qs}` : ""}`);
  },

  count: (companyId: string) =>
    api.get<NotificationCounts>(`/companies/${companyId}/notifications/count`),

  markRead: (companyId: string, notificationId: string) =>
    api.patch<{ ok: boolean }>(`/companies/${companyId}/notifications/${notificationId}/read`, {}),

  markAllRead: (companyId: string) =>
    api.patch<{ ok: boolean }>(`/companies/${companyId}/notifications/read-all`, {}),

  dismiss: (companyId: string, notificationId: string) =>
    api.patch<{ ok: boolean }>(`/companies/${companyId}/notifications/${notificationId}/dismiss`, {}),
};
