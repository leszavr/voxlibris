import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Save } from "lucide-react";

import { fetchPlatformSettings, updatePlatformSettings } from "./api";
import type { PlatformSettingsResponse } from "./types";

export function PlatformUrlSettings() {
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

