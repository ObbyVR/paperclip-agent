import type {
  Blueprint,
  BlueprintListItem,
  BlueprintRun,
  BlueprintRunDetail,
} from "@paperclipai/shared";
import { api } from "./client";

export const blueprintsApi = {
  list: (companyId: string, all = false) =>
    api.get<BlueprintListItem[]>(`/companies/${companyId}/blueprints${all ? "?all=true" : ""}`),
  get: (id: string) => api.get<Blueprint>(`/blueprints/${id}`),
  getBySlug: (companyId: string, slug: string) =>
    api.get<Blueprint>(`/companies/${companyId}/blueprints/slug/${slug}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Blueprint>(`/companies/${companyId}/blueprints`, data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Blueprint>(`/blueprints/${id}`, data),
  remove: (id: string) => api.delete<void>(`/blueprints/${id}`),
  startRun: (blueprintId: string, data?: Record<string, unknown>) =>
    api.post<BlueprintRun>(`/blueprints/${blueprintId}/runs`, data ?? {}),
  listRuns: (blueprintId: string) =>
    api.get<BlueprintRun[]>(`/blueprints/${blueprintId}/runs`),
  getRun: (runId: string) =>
    api.get<BlueprintRunDetail>(`/blueprint-runs/${runId}`),
  updateRun: (runId: string, data: Record<string, unknown>) =>
    api.patch<BlueprintRun>(`/blueprint-runs/${runId}`, data),
  completeStep: (runId: string, stepId: string, data: Record<string, unknown>) =>
    api.post<BlueprintRun>(`/blueprint-runs/${runId}/steps/${stepId}/complete`, data),
};
