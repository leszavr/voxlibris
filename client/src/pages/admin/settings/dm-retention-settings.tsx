import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, MessageCircle, RefreshCw, Save } from "lucide-react";
import { modalAlert } from "@/hooks/use-toast";

import { fetchDmRetentionAdminSettings, runDmRetentionCleanup, updateDmRetentionAdminSettings } from "./api";
import type { DmRetentionAdminSettings, DmRetentionCleanupStats } from "./types";

export function DmRetentionSettings() {
  const queryClient = useQueryClient();
  const [adminMaxDays, setAdminMaxDays] = useState(365);
  const [hardDeleteGraceDays, setHardDeleteGraceDays] = useState(30);
  const [batchSize, setBatchSize] = useState(3000);
  const [lastRunStats, setLastRunStats] = useState<DmRetentionCleanupStats | null>(null);

  const { data, isLoading, error } = useQuery<DmRetentionAdminSettings>({
    queryKey: ['dm-retention-admin-settings'],
    queryFn: fetchDmRetentionAdminSettings,
  });

  React.useEffect(() => {
    if (!data) return;
    setAdminMaxDays(data.adminMaxDays);
    setHardDeleteGraceDays(data.hardDeleteGraceDays);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: updateDmRetentionAdminSettings,
    onSuccess: (settings) => {
      setAdminMaxDays(settings.adminMaxDays);
      setHardDeleteGraceDays(settings.hardDeleteGraceDays);
      queryClient.invalidateQueries({ queryKey: ['dm-retention-admin-settings'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      void modalAlert({
        title: 'Ошибка сохранения',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: runDmRetentionCleanup,
    onSuccess: (stats) => {
      setLastRunStats(stats);
      queryClient.invalidateQueries({ queryKey: ['dm-retention-admin-settings'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      void modalAlert({
        title: 'Ошибка запуска очистки',
        description: message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек автоочистки ЛС...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">Ошибка загрузки настроек автоочистки ЛС</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const saveSettings = () => {
    saveMutation.mutate({ adminMaxDays, hardDeleteGraceDays });
  };

  const runCleanup = () => {
    runMutation.mutate(batchSize);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Самоочистка личных сообщений
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dm_admin_max_days">Максимальный срок хранения (дни)</Label>
              <Input
                id="dm_admin_max_days"
                type="number"
                min={10}
                max={365}
                value={adminMaxDays}
                onChange={(e) => setAdminMaxDays(Number.parseInt(e.target.value || '0', 10))}
              />
              <p className="text-xs text-gray-500">Диапазон: 10-365. Это верхняя граница для персональных настроек пользователей.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dm_hard_delete_grace">Период до полного удаления (дни)</Label>
              <Input
                id="dm_hard_delete_grace"
                type="number"
                min={1}
                max={365}
                value={hardDeleteGraceDays}
                onChange={(e) => setHardDeleteGraceDays(Number.parseInt(e.target.value || '0', 10))}
              />
              <p className="text-xs text-gray-500">После мягкого удаления сообщение будет физически удалено по истечении этого периода.</p>
            </div>
          </div>

          <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-700 space-y-1">
            <p>Запуск автоматической задачи: ежедневно в 00:10 по таймзоне scheduler.</p>
            <p>Этапы: 1) мягкое удаление просроченных, 2) полное удаление мягко удаленных после периода ожидания.</p>
            <p>Очистка выполняется батчами, чтобы не создавать длинные блокировки.</p>
          </div>

          <Button onClick={saveSettings} disabled={saveMutation.isPending} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Сохраняем...' : 'Сохранить политику автоочистки ЛС'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Форс-запуск очистки
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dm_cleanup_batch_size">Размер батча</Label>
            <Input
              id="dm_cleanup_batch_size"
              type="number"
              min={500}
              max={10000}
              value={batchSize}
              onChange={(e) => setBatchSize(Number.parseInt(e.target.value || '0', 10))}
            />
          </div>

          <Button onClick={runCleanup} disabled={runMutation.isPending} className="w-full" variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${runMutation.isPending ? 'animate-spin' : ''}`} />
            {runMutation.isPending ? 'Запускаем очистку...' : 'Запустить очистку сейчас'}
          </Button>

          {lastRunStats && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1 text-sm">
              <p><span className="font-medium">Мягко удалено:</span> {lastRunStats.softDeleted}</p>
              <p><span className="font-medium">Удалено полностью:</span> {lastRunStats.hardDeleted}</p>
              <p><span className="font-medium">Длительность:</span> {lastRunStats.durationMs} мс</p>
              <p><span className="font-medium">Размер батча:</span> {lastRunStats.batchSize}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

