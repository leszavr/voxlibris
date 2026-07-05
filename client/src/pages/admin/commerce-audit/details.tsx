import { AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { discrepancyTypeLabels, entitlementStatusLabels, eventStatusLabels, ledgerStatusLabels, ledgerTypeLabels, paymentStatusLabels, productTypeLabels, sourceTypeLabels } from "./constants";
import type { Discrepancy, PaymentDetails } from "./types";
import { discrepancyDetails, formatDate, formatDiscrepancyDetail, formatMoney, labelOf, paymentIdFromDiscrepancy } from "./utils";
import { EmptyState, StatusBadge } from "./ui";

export function DiscrepancyDetailsView({ discrepancy, openPayment }: Readonly<{ discrepancy: Discrepancy; openPayment: (paymentId: string) => void }>) {
  const details = discrepancyDetails(discrepancy);
  const paymentId = paymentIdFromDiscrepancy(discrepancy);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={discrepancy.severity === "critical" ? "destructive" : "secondary"} className="gap-1">
            {discrepancy.severity === "critical" ? <AlertTriangle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {discrepancy.severity === "critical" ? "Критично" : "Предупреждение"}
          </Badge>
          <span className="font-medium">{labelOf(discrepancyTypeLabels, discrepancy.type)}</span>
        </div>
        <p className="text-sm">{discrepancy.description}</p>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <Label>Проблемная сущность</Label>
          <div className="mt-1 font-mono text-xs">{discrepancy.entityType}:{discrepancy.entityId}</div>
        </div>
        <div className="rounded-lg border p-3">
          <Label>Связанный платёж</Label>
          <div className="mt-1 font-mono text-xs">{paymentId ?? "Не найден"}</div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-medium">Что вызвало расхождение</h3>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          {Object.entries(details).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <div className="text-xs text-amber-800">{key}</div>
              <div className="break-all font-mono text-xs">{formatDiscrepancyDetail(key, value)}</div>
            </div>
          ))}
        </div>
      </div>

      {paymentId ? <Button onClick={() => openPayment(paymentId)}>Открыть полную цепочку платежа</Button> : null}
    </div>
  );
}

export function PaymentDetailsView({ data }: Readonly<{ data: PaymentDetails }>) {
  const { payment, product, price, user, provider, events, entitlements, ledger, diagnostics } = data;

  return (
    <div className="space-y-6">
      {/* Основная информация */}
      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
        <div><Label>ID платежа</Label><div className="font-mono text-xs bg-muted p-2 rounded">{payment.id}</div></div>
        <div><Label>Статус</Label><div><StatusBadge status={payment.status} labels={paymentStatusLabels} /></div></div>
        <div><Label>Сумма</Label><div className="font-medium" title={payment.amountFormatted}>{formatMoney(payment.amountKopecks)}</div></div>
        <div><Label>Провайдер</Label><div>{provider ? `${provider.name} (${provider.code})` : "—"}</div></div>
        <div><Label>ID платежа у провайдера</Label><div className="font-mono text-xs">{payment.providerPaymentId ?? "—"}</div></div>
        <div><Label>Дата</Label><div>{formatDate(payment.createdAt)}</div></div>
        <div><Label>Пользователь</Label><div>{user ? `${user.email} (${user.username})` : "—"}</div></div>
        <div><Label>Продукт</Label><div>{product ? `${product.title} (${labelOf(productTypeLabels, product.type)})` : "—"}</div></div>
        <div><Label>Цена</Label><div>{price ? `${price.amountRub} ₽ / ${price.period}` : "—"}</div></div>
        {payment.fiscalReceiptUrl ? (
          <div><Label>Чек</Label><a href={payment.fiscalReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Открыть чек ↗</a></div>
        ) : null}
      </div>

      {/* Диагностика */}
      <Card>
        <CardHeader><CardTitle className="text-base">Диагностика цепочки</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <DiagItem label="Заказ" ok={diagnostics.hasOrder} />
            <DiagItem label="Провайдер" ok={diagnostics.hasProvider} />
            <DiagItem label="Событие провайдера" ok={diagnostics.hasProviderEvent} />
            <DiagItem label="Доступ выдан" ok={diagnostics.hasEntitlement} />
            <DiagItem label="Членство/грант" ok={diagnostics.hasMembershipOrGrant} />
            <DiagItem label="Начисления созданы" ok={diagnostics.hasLedgerEntries} />
            <div className="flex items-center gap-2">
              {diagnostics.ledgerAmountMatchesPayment === null ? (
                <span className="text-muted-foreground">—</span>
              ) : diagnostics.ledgerAmountMatchesPayment ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm">Сумма начислений: {formatMoney(diagnostics.ledgerAmountKopecks)} / {formatMoney(diagnostics.paymentAmountKopecks)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* События */}
      <div>
        <h3 className="mb-2 font-medium">События провайдера ({events.length})</h3>
        {events.length === 0 ? <EmptyState text="Событий нет" /> : (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-mono text-xs">{ev.eventType}</span>
                  <StatusBadge status={ev.status} labels={eventStatusLabels} />
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(ev.receivedAt)}{ev.errorMessage ? ` · ${ev.errorMessage}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Доступы */}
      <div>
        <h3 className="mb-2 font-medium">Доступы ({entitlements.length})</h3>
        {entitlements.length === 0 ? <EmptyState text="Доступов нет" /> : (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {entitlements.map((e) => (
              <div key={e.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-mono text-xs">{e.featureKey}</span>
                  <StatusBadge status={e.status} labels={entitlementStatusLabels} />
                </div>
                <div className="text-xs text-muted-foreground">{labelOf(sourceTypeLabels, e.sourceType)}{e.sourceId ? ` · ${e.sourceId.slice(0, 8)}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger */}
      <div>
        <h3 className="mb-2 font-medium">Начисления ({ledger.length})</h3>
        {ledger.length === 0 ? <EmptyState text="Начислений нет" /> : (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {ledger.map((l) => (
              <div key={l.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span>{labelOf(ledgerTypeLabels, l.entryType)}</span>
                  <span className="font-medium" title={l.amountFormatted}>{formatMoney(l.amountKopecks)}</span>
                </div>
                <div className="text-xs text-muted-foreground"><StatusBadge status={l.status} labels={ledgerStatusLabels} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagItem({ label, ok }: Readonly<{ label: string; ok: boolean }>) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-destructive" />}
      <span className="text-sm">{label}</span>
    </div>
  );
}
