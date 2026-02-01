import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  Loader2, 
  Monitor, 
  Wifi, 
  Mic, 
  HardDrive,
  X,
  RefreshCw
} from "lucide-react";
import { useSystemCheck } from "@/hooks/use-system-check";
import { cn } from "@/lib/utils";

interface SystemCheckDialogProps {
  readonly onClose: () => void;
  readonly onComplete?: () => void;
}

export function SystemCheckDialog({ onClose, onComplete }: SystemCheckDialogProps) {
  const { isChecking, result, error, runCheck } = useSystemCheck();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-6 h-6 text-emerald-500" />;
      case 'warning':
        return <AlertCircle className="w-6 h-6 text-amber-500" />;
      case 'not-ready':
        return <X className="w-6 h-6 text-red-500" />;
      default:
        return <Info className="w-6 h-6 text-stone-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready':
        return 'Готов к эфиру';
      case 'warning':
        return 'Есть предупреждения';
      case 'not-ready':
        return 'Требуется настройка';
      default:
        return 'Неизвестно';
    }
  };

  const getNetworkQuality = (quality: string) => {
    switch (quality) {
      case 'good':
        return { label: 'Отличное', color: 'text-emerald-500' };
      case 'fair':
        return { label: 'Нормальное', color: 'text-amber-500' };
      case 'poor':
        return { label: 'Плохое', color: 'text-red-500' };
      default:
        return { label: 'Неизвестно', color: 'text-stone-400' };
    }
  };

  return (
    <div className="bg-[#252525] rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      {/* Заголовок */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#252525] z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <Monitor className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Проверка системы</h2>
            <p className="text-sm text-stone-400">Диагностика вашего компьютера</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-stone-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {/* Статус проверки */}
        {!result && !error && !isChecking && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto">
              <Monitor className="w-8 h-8 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                Готовы начать проверку?
              </h3>
              <p className="text-sm text-stone-400">
                Проверим совместимость браузера, доступность микрофона, качество сети и свободное место
              </p>
            </div>
            <Button
              onClick={runCheck}
              className="bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              Запустить проверку
            </Button>
          </div>
        )}

        {/* Процесс проверки */}
        {isChecking && (
          <div className="text-center space-y-4 py-8">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                Проверяем систему...
              </h3>
              <p className="text-sm text-stone-400">
                Пожалуйста, подождите
              </p>
            </div>
          </div>
        )}

        {/* Ошибка */}
        {error && (
          <Alert variant="destructive" className="bg-red-950/20 border-red-900">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Результаты */}
        {result && (
          <>
            {/* Общий статус */}
            <Card className={cn(
              "border-2",
              (() => {
                if (result.overallStatus === 'ready') return 'bg-emerald-950/20 border-emerald-900/50';
                if (result.overallStatus === 'warning') return 'bg-amber-950/20 border-amber-900/50';
                return 'bg-red-950/20 border-red-900/50';
              })()
            )}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {getStatusIcon(result.overallStatus)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white text-lg mb-1">
                      {getStatusLabel(result.overallStatus)}
                    </h3>
                    <p className="text-sm text-stone-400">
                      {(() => {
                        if (result.overallStatus === 'ready') return 'Все системы работают нормально';
                        if (result.overallStatus === 'warning') return 'Обнаружены некритичные проблемы';
                        return 'Требуется устранить проблемы перед эфиром';
                      })()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Детальные результаты */}
            <div className="space-y-3">
              {/* Браузер */}
              <Card className="bg-stone-900/50 border-stone-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Monitor className="w-5 h-5 text-stone-400" />
                      <div>
                        <div className="font-medium text-white">Браузер</div>
                        <div className="text-sm text-stone-400">
                          {result.browser.name} {result.browser.version}
                        </div>
                      </div>
                    </div>
                    <Badge variant={result.browser.compatible ? "default" : "destructive"}>
                      {result.browser.compatible ? 'Совместим' : 'Не совместим'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Микрофон */}
              <Card className="bg-stone-900/50 border-stone-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mic className="w-5 h-5 text-stone-400" />
                      <div>
                        <div className="font-medium text-white">Микрофон</div>
                        <div className="text-sm text-stone-400">
                          {result.microphone.available 
                            ? `Обнаружено устройств: ${result.microphone.devices.length}`
                            : 'Микрофон не найден'
                          }
                        </div>
                      </div>
                    </div>
                    <Badge variant={result.microphone.available ? "default" : "destructive"}>
                      {result.microphone.available ? 'Доступен' : 'Недоступен'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Сеть */}
              <Card className="bg-stone-900/50 border-stone-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Wifi className="w-5 h-5 text-stone-400" />
                      <div>
                        <div className="font-medium text-white">Сеть</div>
                        <div className="text-sm text-stone-400">
                          Задержка: {result.network.latency} мс
                        </div>
                      </div>
                    </div>
                    <Badge 
                      variant="outline"
                      className={cn(
                        "border-current",
                        getNetworkQuality(result.network.quality).color
                      )}
                    >
                      {getNetworkQuality(result.network.quality).label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Хранилище */}
              <Card className="bg-stone-900/50 border-stone-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-5 h-5 text-stone-400" />
                      <div>
                        <div className="font-medium text-white">Хранилище</div>
                        <div className="text-sm text-stone-400">
                          {result.storage.available 
                            ? `~${result.storage.maxRecordingMinutes} мин записи`
                            : 'Недостаточно места'
                          }
                        </div>
                      </div>
                    </div>
                    <Badge variant={result.storage.available ? "default" : "destructive"}>
                      {result.storage.available ? 'ОК' : 'Мало места'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Рекомендации */}
            <Card className="bg-stone-900/50 border-stone-800">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Рекомендации
                </h4>
                <div className="space-y-2">
                  {result.recommendations.map((rec, idx) => (
                    <div key={`recommendation-${idx}-${rec.slice(0, 10)}`} className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                      <span className="text-stone-300">{rec}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Действия */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={runCheck}
                className="flex-1 border-stone-600"
                disabled={isChecking}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isChecking && "animate-spin")} />
                Проверить снова
              </Button>
              <Button
                onClick={() => {
                  onComplete?.();
                  onClose();
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={result.overallStatus === 'not-ready'}
              >
                Продолжить
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
