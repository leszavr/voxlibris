import { AdminLayout } from "@/components/layout/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modalAlert } from "@/hooks/use-toast";

import { DmRetentionSettings } from "./settings/dm-retention-settings";
import { FeatureFlagsSettings } from "./settings/feature-flags-settings";
import { FeedbackSettings } from "./settings/feedback-settings";
import { GeneralSettings } from "./settings/general-settings";
import { PlatformUrlSettings } from "./settings/platform-url-settings";
import { SecuritySettings } from "./settings/security-settings";
import { SMTPSettings } from "./settings/smtp-settings";
import { SystemMonitoring } from "./settings/system-monitoring";
import { fetchGeneralSettings, fetchSystemHealth, fetchSystemSettings, updateGeneralSettings, updateSystemSettings } from "./settings/api";
import type { SystemHealth, SystemSettings } from "./settings/types";

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
