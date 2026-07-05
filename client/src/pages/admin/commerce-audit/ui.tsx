import type { ReactNode } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { labelOf } from "./utils";

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: Readonly<{ error: unknown; onRetry?: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {error instanceof Error ? error.message : "Ошибка загрузки данных"}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Повторить
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ text }: Readonly<{ text: string }>) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

// ── Карточка сводки ───────────────────────────────────────────────────────────

export function SummaryCard({ title, value, sub, icon }: Readonly<{ title: string; value: string | number; sub?: string; icon: ReactNode }>) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

// ── Пагинация ─────────────────────────────────────────────────────────────────

export function Pagination({ page, pageSize, total, onPage }: Readonly<{ page: number; pageSize: number; total: number; onPage: (page: number) => void }>) {
  const pages = Math.ceil(total / pageSize) || 1;
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between mt-4">
      <div className="text-sm text-muted-foreground">
        Показано {from}–{to} из {total}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Назад
        </Button>
        <span className="text-sm">Стр. {page} из {pages}</span>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} className="gap-1">
          Вперёд <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Бейджи статусов ───────────────────────────────────────────────────────────

export function StatusBadge({ status, labels }: Readonly<{ status: string; labels: Record<string, string> }>) {
  const variant: "default" | "destructive" | "secondary" | "outline" =
    status === "succeeded" || status === "paid" || status === "processed" || status === "active" || status === "available"
      ? "default"
      : status === "failed" || status === "revoked" || status === "deleted" || status === "void"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{labelOf(labels, status)}</Badge>;
}
