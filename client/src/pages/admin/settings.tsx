import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Settings, 
  Shield,
  Server,
  Database,
  Globe,
  AlertTriangle,
  Save,
  RefreshCw,
  MessageCircle,
  Users
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as React from "react";
import { modalAlert } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type HealthStatus = 'healthy' | 'warning' | 'error';

interface SystemSettings {
  general: {
    registrationEnabled: boolean;
    maintenanceMode: boolean;
    maintenanceReason: string;
    maintenanceUntil: string;
    maintenanceMessage: string;
  };
  security: {
    require_email_verification: boolean;
    max_login_attempts: number;
    password_min_length: number;
    require_2fa_for_admins: boolean;
  };
  notifications: {
    email_notifications: boolean;
    admin_email: string;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_enabled: boolean;
  };
  moderation: {
    auto_moderation_enabled: boolean;
    require_book_approval: boolean;
    require_club_approval: boolean;
    spam_detection_enabled: boolean;
    profanity_filter_enabled: boolean;
  };
}

interface SystemHealth {
  database: {
    status: HealthStatus;
    connections: number;
    max_connections: number;
    uptime: string;
  };
  server: {
    status: HealthStatus;
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    uptime: string;
  };
  services: {
    auth_service: boolean;
    file_storage: boolean;
    email_service: boolean;
    background_jobs: boolean;
  };
}

interface PlatformSettingsResponse {
  settings: {
    canonicalUrl: string;
    effectiveUrl: string;
    source: 'database' | 'environment' | 'fallback';
  };
}

interface GeneralSettingsResponse {
  settings: SystemSettings['general'];
}

interface DmRetentionAdminSettings {
  adminMaxDays: number;
  hardDeleteGraceDays: number;
}

interface DmRetentionCleanupStats {
  softDeleted: number;
  hardDeleted: number;
  durationMs: number;
  batchSize: number;
  adminMaxDays: number;
  hardDeleteGraceDays: number;
}

type AdminSettingsApiValue = { value: unknown };
type AdminSettingsApiResponse = Record<string, Record<string, AdminSettingsApiValue>>;

function readSetting<T>(items: Record<string, AdminSettingsApiValue> | undefined, key: string, fallback: T): T {
  const value = items?.[key]?.value;
  return value === undefined ? fallback : value as T;
}

async function fetchSystemSettings(): Promise<SystemSettings> {
  const response = await apiRequest<AdminSettingsApiResponse>('/api/v1/admin/settings');
  const security = response.security;

  return {
    ...response,
    general: response.general as unknown as SystemSettings['general'],
    security: {
      require_email_verification: readSetting(security, 'security.require_email_verification', true),
      max_login_attempts: readSetting(security, 'security.max_login_attempts', 5),
      password_min_length: readSetting(security, 'security.password_min_length', 8),
      require_2fa_for_admins: false,
    },
  } as SystemSettings;
}

async function fetchGeneralSettings(): Promise<SystemSettings['general']> {
  const response = await apiRequest<GeneralSettingsResponse>('/api/v1/admin/settings/general');
  return response.settings;
}

async function updateGeneralSettings(settings: SystemSettings['general']): Promise<SystemSettings['general']> {
  const response = await apiRequest<GeneralSettingsResponse>('/api/v1/admin/settings/general', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.settings;
}

async function fetchPlatformSettings(): Promise<PlatformSettingsResponse> {
  return apiRequest<PlatformSettingsResponse>('/api/v1/admin/settings/platform');
}

async function updatePlatformSettings(canonicalUrl: string): Promise<void> {
  await apiRequest('/api/v1/admin/settings/platform', {
    method: 'PUT',
    body: JSON.stringify({ canonicalUrl }),
  });
}

async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<void> {
  const payload = settings.security ? {
    'security.require_email_verification': settings.security.require_email_verification,
    'security.max_login_attempts': settings.security.max_login_attempts,
    'security.password_min_length': settings.security.password_min_length,
    'security.require_2fa_for_admins': false,
  } : settings;

  await apiRequest('/api/v1/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function fetchSystemHealth(): Promise<SystemHealth> {
  return apiRequest<SystemHealth>('/api/v1/admin/system/health');
}

async function fetchDmRetentionAdminSettings(): Promise<DmRetentionAdminSettings> {
  const response = await apiRequest<{ success: boolean; settings: DmRetentionAdminSettings }>('/api/dm/admin/retention-settings');
  return response.settings;
}

async function updateDmRetentionAdminSettings(payload: {
  adminMaxDays?: number;
  hardDeleteGraceDays?: number;
}): Promise<DmRetentionAdminSettings> {
  const response = await apiRequest<{ success: boolean; settings: DmRetentionAdminSettings }>('/api/dm/admin/retention-settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.settings;
}

async function runDmRetentionCleanup(batchSize?: number): Promise<DmRetentionCleanupStats> {
  const response = await apiRequest<{ success: boolean; stats: DmRetentionCleanupStats }>('/api/dm/admin/retention-cleanup/run', {
    method: 'POST',
    body: JSON.stringify({ batchSize }),
  });
  return response.stats;
}

function StatusBadge({ status }: { readonly status: HealthStatus }) {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          Работает
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          Предупреждение
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          Ошибка
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function GeneralSettings({ settings, onUpdate, isSaving = false }: {
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

function SecuritySettings({ settings, onUpdate }: {
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

function PlatformUrlSettings() {
  const queryClient = useQueryClient();
  const [canonicalUrl, setCanonicalUrl] = useState('');

  const { data, isLoading } = useQuery<PlatformSettingsResponse>({
    queryKey: ['platform-settings'],
    queryFn: fetchPlatformSettings,
  });

  React.useEffect(() => {
    if (data?.settings?.canonicalUrl) {
      setCanonicalUrl(data.settings.canonicalUrl);
    } else if (data?.settings?.effectiveUrl) {
      setCanonicalUrl(data.settings.effectiveUrl);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: updatePlatformSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    },
  });

  const saveCanonicalUrl = () => {
    saveMutation.mutate(canonicalUrl);
  };

  let sourceLabel = 'Fallback разработки';
  if (data?.settings.source === 'database') {
    sourceLabel = 'Из БД';
  } else if (data?.settings.source === 'environment') {
    sourceLabel = 'Из переменных окружения';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Canonical URL платформы
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="canonical_url">Canonical URL</Label>
          <Input
            id="canonical_url"
            value={canonicalUrl}
            onChange={(e) => setCanonicalUrl(e.target.value)}
            placeholder="https://voxli.ru"
            disabled={isLoading || saveMutation.isPending}
          />
          <p className="text-sm text-gray-500">
            Используется в email-ссылках и внешних ссылках. Для каждого окружения (alfa/prod) задается отдельно в своей админке.
          </p>
          {data?.settings?.effectiveUrl && (
            <p className="text-xs text-gray-500">
              Текущий effective URL: <span className="font-mono">{data.settings.effectiveUrl}</span> ({sourceLabel})
            </p>
          )}
        </div>

        <Button onClick={saveCanonicalUrl} disabled={saveMutation.isPending || !canonicalUrl.trim()} className="w-full">
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Сохраняем...' : 'Сохранить canonical URL'}
        </Button>
      </CardContent>
    </Card>
  );
}

function SystemMonitoring({ health, isLoading, error }: { 
  readonly health?: SystemHealth;
  readonly isLoading?: boolean;
  readonly error?: Error | null;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500">Загрузка информации о системе...</p>
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
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 font-semibold">Ошибка загрузки данных мониторинга</p>
            <p className="text-gray-500 mt-2 text-sm">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Нет данных о системе</p>
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
            <Database className="h-5 w-5" />
            База данных
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Статус</p>
              <StatusBadge status={health.database.status} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Соединения</p>
              <p className="text-lg font-semibold">{health.database.connections}/{health.database.max_connections}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Время работы</p>
              <p className="text-lg font-semibold">{health.database.uptime}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Сервер
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Статус</p>
              <StatusBadge status={health.server.status} />
            </div>
            <div>
              <p className="text-sm text-gray-600">CPU</p>
              <p className="text-lg font-semibold">{health.server.cpu_usage}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Память</p>
              <p className="text-lg font-semibold">{health.server.memory_usage}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Диск</p>
              <p className="text-lg font-semibold">{health.server.disk_usage}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Сервисы
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Аутентификация</span>
              <StatusBadge status={health.services.auth_service ? 'healthy' : 'error'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Файловое хранилище</span>
              <StatusBadge status={health.services.file_storage ? 'healthy' : 'error'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Email сервис</span>
              <StatusBadge status={health.services.email_service ? 'healthy' : 'error'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Фоновые задачи</span>
              <StatusBadge status={health.services.background_jobs ? 'healthy' : 'error'} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Feedback Settings Component
function FeedbackSettings() {
  const [localSettings, setLocalSettings] = useState({
    emails: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const { data: feedbackSettings, isLoading, error } = useQuery({
    queryKey: ['admin', 'feedback-settings'],
    queryFn: async () => {
      return apiRequest<{ success: boolean; settings: { 'feedback.emails': string } }>('/api/v1/admin/settings/feedback');
    },
  });

  const saveFeedbackSettings = useMutation({
    mutationFn: async (settings: { emails: string }) => {
      return apiRequest('/api/v1/admin/settings/feedback', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      setIsSaving(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Не удалось сохранить настройки.";
      void modalAlert({
        title: "Ошибка сохранения",
        description: errorMessage,
      });
      setIsSaving(false);
    },
  });

  React.useEffect(() => {
    if (feedbackSettings?.settings) {
      setLocalSettings({
        emails: feedbackSettings.settings['feedback.emails'] || ''
      });
    }
  }, [feedbackSettings]);

  const handleSave = () => {
    setIsSaving(true);
    saveFeedbackSettings.mutate(localSettings);
  };

  const handleInputChange = (field: string, value: string) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек обратной связи...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">Ошибка загрузки настроек обратной связи</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Настройки обратной связи
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback_emails">Email адреса для получения обратной связи *</Label>
            <Textarea
              id="feedback_emails"
              placeholder="admin@example.com, support@example.com"
              value={localSettings.emails}
              onChange={(e) => handleInputChange('emails', e.target.value)}
              rows={3}
            />
            <p className="text-sm text-gray-500">
              Укажите email адреса через запятую, на которые будут приходить сообщения обратной связи от пользователей.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !localSettings.emails.trim()}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 mt-0.5">
              <Settings className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900">Как это работает</p>
              <p className="text-sm text-blue-700">
                Пользователи смогут отправлять сообщения через форму обратной связи в футере сайта. 
                Все сообщения будут приходить на указанные email адреса с возможностью прямого ответа отправителю.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// SMTP Settings Component
function SMTPSettings() {
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
function FeatureFlagsSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ features: Record<string, boolean> }>({
    queryKey: ['admin-features'],
    queryFn: async () => {
      return apiRequest<{ features: Record<string, boolean> }>('/api/v1/admin/features');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('/api/v1/admin/features/guest-access', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateLandingReaderClubsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('/api/v1/admin/features/landing-reader-clubs', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateLandingTopReadersMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('/api/v1/admin/features/landing-top-readers', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const guestEnabled = data?.features?.['guest.access.enabled'] ?? false;
  const landingReaderClubsEnabled = data?.features?.['landing.readerClubs.enabled'] ?? false;
  const landingTopReadersEnabled = data?.features?.['landing.topReaders.enabled'] ?? false;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек функций...</p>
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
            <p className="text-red-600">Ошибка загрузки настроек</p>
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
            <Users className="h-5 w-5" />
            Гостевой доступ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="guest_access_enabled">Включить гостевой режим</Label>
              <p className="text-sm text-gray-500">
                Разрешить чтение книг без регистрации (гостевой аккаунт)
              </p>
            </div>
            <Switch
              id="guest_access_enabled"
              checked={guestEnabled}
              onCheckedChange={(checked) => updateMutation.mutate(checked)}
              disabled={updateMutation.isPending}
            />
          </div>

          {guestEnabled && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-800">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Гостевой доступ включён</span>
              </div>
              <p className="text-sm text-green-700 mt-2">
                Пользователи могут читать книги без регистрации через /guest/library
              </p>
            </div>
          )}

          {!guestEnabled && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 text-gray-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Гостевой доступ выключен</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Для включения переключите тоггл выше. Изменение применяется мгновенно.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Лендинг: клубы чтецов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="landing_reader_clubs_enabled">Показывать блок клубов чтецов</Label>
              <p className="text-sm text-gray-500">
                Включайте, когда накопится достаточно опубликованных клубов чтецов для аккуратной витрины.
              </p>
            </div>
            <Switch
              id="landing_reader_clubs_enabled"
              checked={landingReaderClubsEnabled}
              onCheckedChange={(checked) => updateLandingReaderClubsMutation.mutate(checked)}
              disabled={updateLandingReaderClubsMutation.isPending}
            />
          </div>

          {landingReaderClubsEnabled ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-800">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Блок клубов чтецов включён</span>
              </div>
              <p className="text-sm text-green-700 mt-2">
                На главной странице будет показано до 6 популярных клубов чтецов.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 text-gray-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Блок клубов чтецов скрыт</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Лендинг не показывает пустую или неполную витрину, пока функция не включена вручную.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Лендинг: рейтинг чтецов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="landing_top_readers_enabled">Показывать рейтинг лучших чтецов</Label>
              <p className="text-sm text-gray-500">
                Включайте, когда в рейтинге достаточно профилей со статусом чтеца для аккуратного блока на главной.
              </p>
            </div>
            <Switch
              id="landing_top_readers_enabled"
              checked={landingTopReadersEnabled}
              onCheckedChange={(checked) => updateLandingTopReadersMutation.mutate(checked)}
              disabled={updateLandingTopReadersMutation.isPending}
            />
          </div>

          {landingTopReadersEnabled ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-800">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Рейтинг чтецов включён</span>
              </div>
              <p className="text-sm text-green-700 mt-2">
                На главной странице будет показано до 6 лучших чтецов VoxLibris.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 text-gray-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Рейтинг чтецов скрыт</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Лендинг не показывает пустой или слишком короткий рейтинг, пока функция не включена вручную.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DmRetentionSettings() {
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

export default function AdminSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ['admin-settings'],
    queryFn: fetchSystemSettings,
  });

  const { data: generalSettings, isLoading: generalSettingsLoading } = useQuery<SystemSettings['general']>({
    queryKey: ['admin-general-settings'],
    queryFn: fetchGeneralSettings,
  });

  const { data: health, isLoading: healthLoading, error: healthError } = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000, // Обновляем каждые 30 секунд
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
  });

  const updateGeneralSettingsMutation = useMutation({
    mutationFn: updateGeneralSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-general-settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-general-settings'] });
      void modalAlert({
        title: 'Настройки сохранены',
        description: 'Общие настройки платформы обновлены.',
      });
    },
    onError: (error) => {
      void modalAlert({
        title: 'Не удалось сохранить настройки',
        description: error instanceof Error ? error.message : 'Проверьте права администратора и попробуйте ещё раз.',
        variant: 'destructive',
      });
    },
  });

  const handleUpdateSettings = (updates: Partial<SystemSettings>) => {
    updateSettingsMutation.mutate(updates);
  };

  if (settingsLoading || generalSettingsLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!settings || !generalSettings) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить настройки системы</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Системные настройки</h1>
          <p className="text-gray-600 mt-2">Управление конфигурацией и мониторинг системы</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="general">Общие</TabsTrigger>
            <TabsTrigger value="security">Безопасность</TabsTrigger>
            <TabsTrigger value="smtp">SMTP</TabsTrigger>
            <TabsTrigger value="feedback">Обратная связь</TabsTrigger>
            <TabsTrigger value="features">Функции</TabsTrigger>
            <TabsTrigger value="dm-retention">Автоочистка ЛС</TabsTrigger>
            <TabsTrigger value="monitoring">Мониторинг</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <GeneralSettings 
              settings={generalSettings} 
              onUpdate={(updates) => updateGeneralSettingsMutation.mutate(updates)}
              isSaving={updateGeneralSettingsMutation.isPending}
            />
            <PlatformUrlSettings />
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <SecuritySettings 
              settings={settings.security} 
              onUpdate={(updates) => handleUpdateSettings({ security: { ...settings.security, ...updates } })}
            />
          </TabsContent>

          <TabsContent value="smtp" className="space-y-6">
            <SMTPSettings />
          </TabsContent>

          <TabsContent value="feedback" className="space-y-6">
            <FeedbackSettings />
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <FeatureFlagsSettings />
          </TabsContent>

          <TabsContent value="dm-retention" className="space-y-6">
            <DmRetentionSettings />
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-6">
            <SystemMonitoring health={health} isLoading={healthLoading} error={healthError} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
