import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, MessageCircle, RefreshCw, Save, Settings } from "lucide-react";
import { modalAlert } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function FeedbackSettings() {
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
