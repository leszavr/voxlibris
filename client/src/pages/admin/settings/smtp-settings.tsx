import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Globe, RefreshCw, Save, Server } from "lucide-react";
import { modalAlert } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function SMTPSettings() {
  const [localSettings, setLocalSettings] = useState({
    host: '',
    port: '587',
    user: '',
    password: '',
    from: '',
    secure: false,
    enabled: false,
  });
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const queryClient = useQueryClient();

  // Загрузка текущих настроек
  const { data: smtpData, isLoading } = useQuery({
    queryKey: ['smtp-settings'],
    queryFn: async () => {
      const data = await apiRequest<{ settings: Record<string, string> }>('/api/v1/admin/settings/smtp');
      return data.settings;
    },
  });

  // Обновление локального состояния при загрузке данных
  React.useEffect(() => {
    if (smtpData) {
      setLocalSettings({
        host: smtpData['smtp.host'] || '',
        port: smtpData['smtp.port'] || '587',
        user: smtpData['smtp.user'] || '',
        password: smtpData['smtp.password'] || '',
        from: smtpData['smtp.from'] || '',
        secure: smtpData['smtp.secure'] === 'true',
        enabled: smtpData['smtp.enabled'] === 'true',
      });
    }
  }, [smtpData]);

  // Мутация для сохранения настроек
  const saveMutation = useMutation({
    mutationFn: async (settings: typeof localSettings) => {
      return apiRequest('/api/v1/admin/settings/smtp', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtp-settings'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Функция отправки тестового письма
  const handleTestEmail = async () => {
    if (!testEmail) {
      void modalAlert({
        title: "Укажите email",
        description: "Введите email для отправки тестового письма.",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    try {
      const data = await apiRequest<{ success: boolean; message?: string }>('/api/v1/admin/settings/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ testEmail }),
      });
      if (!data.success) {
        void modalAlert({
          title: "Ошибка отправки",
          description: data.message || "Не удалось отправить тестовое письмо.",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      void modalAlert({
        title: "Ошибка отправки",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(localSettings);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек SMTP...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Настройки SMTP сервера
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="smtp_enabled">Включить SMTP</Label>
              <p className="text-sm text-gray-500">Активировать отправку email через SMTP</p>
            </div>
            <Switch
              id="smtp_enabled"
              checked={localSettings.enabled}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">Хост SMTP сервера *</Label>
              <Input
                id="smtp_host"
                placeholder="mail.yourdomain.com"
                value={localSettings.host}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, host: e.target.value }))}
              />
              <p className="text-xs text-gray-500">Например: mail.yourdomain.com или smtp.gmail.com</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_port">Порт *</Label>
              <Input
                id="smtp_port"
                type="number"
                placeholder="587"
                value={localSettings.port}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, port: e.target.value }))}
              />
              <p className="text-xs text-gray-500">587 (STARTTLS) или 465 (SSL)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_user">Имя пользователя</Label>
              <Input
                id="smtp_user"
                placeholder="noreply@yourdomain.com"
                value={localSettings.user}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, user: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_password">Пароль</Label>
              <Input
                id="smtp_password"
                type="password"
                placeholder="********"
                value={localSettings.password}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, password: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_from">От кого (From email) *</Label>
            <Input
              id="smtp_from"
              placeholder="noreply@xlibris.com"
              value={localSettings.from}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, from: e.target.value }))}
            />
            <p className="text-xs text-gray-500">Email адрес отправителя для всех писем</p>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="smtp_secure">Использовать SSL/TLS</Label>
              <p className="text-sm text-gray-500">Шифрованное подключение (порт 465)</p>
            </div>
            <Switch
              id="smtp_secure"
              checked={localSettings.secure}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, secure: checked }))}
            />
          </div>

          <Button 
            onClick={handleSave} 
            className="w-full" 
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Тестовая отправка
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Отправьте тестовое письмо для проверки правильности настройки SMTP
          </p>
          
          <div className="flex gap-2">
            <Input
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              type="email"
            />
            <Button 
              onClick={handleTestEmail} 
              disabled={isTesting || !localSettings.enabled}
            >
              {isTesting ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>

          {!localSettings.enabled && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 text-yellow-800 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">SMTP отключен. Включите SMTP для отправки тестового письма.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Настройка DNS записей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Для правильной доставки писем настройте следующие DNS записи:
          </p>
          
          <div className="space-y-2 bg-gray-50 p-4 rounded-lg font-mono text-xs">
            <div>
              <span className="text-gray-600">MX запись:</span><br/>
              <span className="text-gray-900">@ 10 mail.yourdomain.com</span>
            </div>
            <div>
              <span className="text-gray-600">SPF запись (TXT):</span><br/>
              <span className="text-gray-900">@ "v=spf1 ip4:YOUR_VDS_IP ~all"</span>
            </div>
            <div>
              <span className="text-gray-600">DMARC запись (TXT):</span><br/>
              <span className="text-gray-900">_dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"</span>
            </div>
            <div>
              <span className="text-gray-600">DKIM запись (TXT):</span><br/>
              <span className="text-gray-900">default._domainkey [your_dkim_public_key]</span>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Проверьте настройки на <a href="https://www.mail-tester.com/" target="_blank" rel="noopener" className="text-blue-600 underline">mail-tester.com</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Feature Flags Settings Component
