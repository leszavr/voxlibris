import type { Discrepancy, FilterState } from "./types";

export function labelOf<T extends string>(labels: Record<T, string>, value: T | string) {
  return labels[value as T] ?? value;
}

// ── Форматирование ────────────────────────────────────────────────────────────

export function formatMoney(kopecks: number): string {
  const rub = kopecks / 100;
  return rub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " руб.";
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export function paymentIdFromDiscrepancy(discrepancy: Discrepancy): string | null {
  if (discrepancy.entityType === "payment") return discrepancy.entityId;
  const details = discrepancy.details;
  if (!details || typeof details !== "object" || !("paymentId" in details)) return null;
  const paymentId = (details as { paymentId?: unknown }).paymentId;
  return typeof paymentId === "string" ? paymentId : null;
}

export function clickableRowClass(paymentId: string | null | undefined) {
  return paymentId ? "cursor-pointer hover:bg-muted/50" : "";
}

export function discrepancyDetails(discrepancy: Discrepancy): Record<string, unknown> {
  return discrepancy.details && typeof discrepancy.details === "object" ? discrepancy.details as Record<string, unknown> : {};
}

export function formatDiscrepancyDetail(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key.toLowerCase().includes("kopecks") && typeof value === "number") return formatMoney(value);
  return String(value);
}

export const emptyFilters: FilterState = {
  from: "", to: "", status: "", provider: "", productType: "", scopeType: "", scopeId: "", userId: "", search: "",
};

export function buildParams(filters: FilterState, page: number, pageSize: number): Record<string, string> {
  const params: Record<string, string> = {
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  };
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.status) params.status = filters.status;
  if (filters.provider) params.provider = filters.provider;
  if (filters.productType) params.productType = filters.productType;
  if (filters.scopeType) params.scopeType = filters.scopeType;
  if (filters.scopeId) params.scopeId = filters.scopeId;
  if (filters.userId) params.userId = filters.userId;
  if (filters.search) params.search = filters.search;
  return params;
}

export function toQueryString(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}
