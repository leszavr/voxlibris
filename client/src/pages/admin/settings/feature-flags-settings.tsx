import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, RefreshCw, Settings, Users } from "lucide-react";
import { modalAlert } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function FeatureFlagsSettings() {
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

