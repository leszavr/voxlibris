import { Download, Loader2 } from "lucide-react";
import { ActivityHeatmap } from "@/components/admin/ActivityHeatmap";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Funnel, FunnelChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AnalyticsStats, HeatmapResponse } from "./types";

type FunnelData = Array<AnalyticsStats['funnel'][number] & { name: string; fill: string }>;

export function ReadingFunnelCard({ funnelData, exportFunnelCsv }: { funnelData: FunnelData; exportFunnelCsv: () => void }) {
  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Воронка чтения</CardTitle>
          <CardDescription>Конверсия по уникальным парам читатель+книга за выбранный период</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={exportFunnelCsv} disabled={!funnelData.length}>
          <Download className="h-4 w-4" />
          Скачать CSV
        </Button>
      </CardHeader>
      <CardContent>
        {funnelData.length === 0 || funnelData.every((stage) => stage.count === 0) ? (
          <div className="text-sm text-muted-foreground">Недостаточно данных для построения воронки за выбранный период.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    formatter={(value?: number, _name?: string, props?: { payload?: { percentage?: number } }) => {
                      const count = typeof value === 'number' ? value : 0;
                      const percentage = props?.payload?.percentage ?? 0;
                      return [`${count.toLocaleString()} • ${percentage}%`, 'Конверсия'];
                    }}
                  />
                  <Funnel dataKey="count" data={funnelData} isAnimationActive />
                </FunnelChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3">
              {funnelData.map((stage, idx) => (
                <div key={stage.stage} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.fill }} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{stage.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {idx === 0 ? 'База' : `${stage.percentage}% от предыдущего шага`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-semibold tabular-nums">{stage.count.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HeatmapCard({
  heatmapStats,
  period,
  isHeatmapLoading,
  isExportingHeatmap,
  exportHeatmapCsv,
}: {
  heatmapStats?: HeatmapResponse;
  period: string;
  isHeatmapLoading: boolean;
  isExportingHeatmap: boolean;
  exportHeatmapCsv: () => void;
}) {
  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Heatmap активности</CardTitle>
          <CardDescription>Распределение событий по дням недели и часам</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={exportHeatmapCsv}
          disabled={!heatmapStats?.heatmap?.some((cell) => cell.count > 0) || isExportingHeatmap}
        >
          {isExportingHeatmap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExportingHeatmap ? 'Формируем CSV...' : 'Скачать CSV'}
        </Button>
      </CardHeader>
      <CardContent>
        {isHeatmapLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ActivityHeatmap data={heatmapStats?.heatmap || []} period={period} />
        )}
      </CardContent>
    </Card>
  );
}
