import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, Save } from "lucide-react";

import type { SystemSettings } from "./types";

export function SecuritySettings({ settings, onUpdate }: {
  readonly settings: SystemSettings['security'];
  readonly onUpdate: (updates: Partial<SystemSettings['security']>) => void;
}) {
  const [localSettings, setLocalSettings] = useState(settings || {
    require_email_verification: true,
    max_login_attempts: 5,
    password_min_length: 8,
    require_2fa_for_admins: false,
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
            <Shield className="h-5 w-5" />
            Настройки безопасности
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_login_attempts">Макс. попыток входа</Label>
              <Input
                id="max_login_attempts"
                type="number"
                min={3}
                max={20}
                value={localSettings.max_login_attempts}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, max_login_attempts: Number.parseInt(e.target.value) }))}
              />
              <p className="text-xs text-gray-500">Количество неверных попыток за 15 минут до временной блокировки.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password_min_length">Мин. длина пароля</Label>
              <Input
                id="password_min_length"
                type="number"
                min={8}
                max={128}
                value={localSettings.password_min_length}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, password_min_length: Number.parseInt(e.target.value) }))}
              />
              <p className="text-xs text-gray-500">Применяется к регистрации, смене и сбросу пароля.</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="require_email_verification">Требовать подтверждение email</Label>
              <p className="text-sm text-gray-500">Новые пользователи должны подтвердить email</p>
            </div>
            <Switch
              id="require_email_verification"
              checked={localSettings.require_email_verification}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, require_email_verification: checked }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-dashed bg-gray-50 p-4 opacity-70">
            <div className="space-y-1">
              <Label htmlFor="require_2fa_for_admins">2FA для администраторов</Label>
              <p className="text-sm text-gray-500">TOTP будет реализован отдельным этапом</p>
            </div>
            <Switch
              id="require_2fa_for_admins"
              checked={false}
              disabled
            />
          </div>

          <Button onClick={handleSave} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Сохранить настройки безопасности
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

