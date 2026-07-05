import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Globe, Save } from "lucide-react";

import type { SystemSettings } from "./types";

export function GeneralSettings({ settings, onUpdate, isSaving = false }: {
  readonly settings: SystemSettings['general'];
  readonly onUpdate: (updates: SystemSettings['general']) => void;
  readonly isSaving?: boolean;
}) {
  const [localSettings, setLocalSettings] = useState(settings || {
    registrationEnabled: true,
    maintenanceMode: false,
    maintenanceReason: '',
    maintenanceUntil: '',
    maintenanceMessage: '',
  });

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onUpdate(localSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Общие настройки платформы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="registration_enabled">Регистрация открыта</Label>
              <p className="text-sm text-gray-500">Разрешить регистрацию новых пользователей</p>
            </div>
            <Switch
              id="registration_enabled"
              checked={localSettings.registrationEnabled}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, registrationEnabled: checked }))}
            />
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="maintenance_mode">Режим обслуживания</Label>
                <p className="text-sm text-gray-500">Заблокировать интерфейс для всех, кроме администраторов</p>
              </div>
              <Switch
                id="maintenance_mode"
                checked={localSettings.maintenanceMode}
                onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, maintenanceMode: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maintenance_reason">Причина остановки</Label>
              <Input
                id="maintenance_reason"
                value={localSettings.maintenanceReason}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, maintenanceReason: e.target.value }))}
                placeholder="Например: Обновление сервера"
              />
              <p className="text-sm text-gray-500">Краткое описание причины технических работ</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maintenance_until">Ориентировочное время окончания</Label>
              <Input
                id="maintenance_until"
                value={localSettings.maintenanceUntil}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, maintenanceUntil: e.target.value }))}
                placeholder="Например: 18:00 или 2 часа"
              />
              <p className="text-sm text-gray-500">Когда планируется завершение работ</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maintenance_message">Дополнительное сообщение</Label>
              <Textarea
                id="maintenance_message"
                value={localSettings.maintenanceMessage}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, maintenanceMessage: e.target.value }))}
                placeholder="Введите дополнительную информацию для пользователей..."
                rows={4}
              />
            </div>
          </div>

          <Button type="button" onClick={handleSave} className="w-full" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Сохраняем...' : 'Сохранить изменения'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

