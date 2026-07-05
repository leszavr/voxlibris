import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Database, Server, Settings, RefreshCw } from "lucide-react";

import { StatusBadge } from "./status-badge";
import type { SystemHealth } from "./types";

export function SystemMonitoring({ health, isLoading, error }: { 
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
