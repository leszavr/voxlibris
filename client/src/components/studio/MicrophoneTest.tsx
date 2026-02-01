import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Mic, Play, RotateCcw, AlertCircle, CheckCircle, Info } from "lucide-react";
import { useMicrophoneTest } from "@/hooks/use-microphone-test";
import { cn } from "@/lib/utils";

interface MicrophoneTestProps {
  readonly onTestComplete: (passed: boolean) => void;
  readonly className?: string;
}

export function MicrophoneTest({ onTestComplete, className }: MicrophoneTestProps) {
  const {
    isRecording,
    hasRecording,
    isPlaying,
    testResult,
    error,
    startRecording,
    stopRecording,
    playRecording,
    resetTest
  } = useMicrophoneTest();

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'good': return 'text-emerald-500';
      case 'fair': return 'text-amber-500';
      case 'poor': return 'text-red-500';
      default: return 'text-stone-400';
    }
  };

  const getQualityLabel = (quality: string) => {
    switch (quality) {
      case 'good': return 'Отличное качество';
      case 'fair': return 'Удовлетворительно';
      case 'poor': return 'Требует настройки';
      default: return '';
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Проверка микрофона</h3>
        {testResult && (
          <Badge 
            variant="outline" 
            className={cn(
              "border-current",
              getQualityColor(testResult.quality)
            )}
          >
            {testResult.quality === 'good' && <CheckCircle className="w-3 h-3 mr-1" />}
            {testResult.quality === 'fair' && <Info className="w-3 h-3 mr-1" />}
            {testResult.quality === 'poor' && <AlertCircle className="w-3 h-3 mr-1" />}
            {getQualityLabel(testResult.quality)}
          </Badge>
        )}
      </div>

      {/* Описание */}
      <p className="text-sm text-stone-400">
        Запишите тестовое сообщение длительностью 5 секунд. Скажите несколько фраз обычным голосом.
      </p>

      {/* Ошибка */}
      {error && (
        <Alert variant="destructive" className="bg-red-950/20 border-red-900">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Кнопки управления */}
      <div className="flex gap-3">
        {!hasRecording && !isRecording && (
          <Button
            onClick={startRecording}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            size="lg"
          >
            <Mic className="w-4 h-4 mr-2" />
            Записать тест (5 сек)
          </Button>
        )}

        {isRecording && (
          <Button
            onClick={stopRecording}
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-950/20"
            size="lg"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" />
            Остановить ({isRecording ? '...' : ''})
          </Button>
        )}

        {hasRecording && (
          <>
            <Button
              onClick={playRecording}
              disabled={isPlaying}
              variant="outline"
              className="border-stone-600 text-stone-300"
              size="lg"
            >
              <Play className="w-4 h-4 mr-2" />
              {isPlaying ? 'Воспроизведение...' : 'Прослушать'}
            </Button>
            
            <Button
              onClick={resetTest}
              variant="ghost"
              size="lg"
              className="text-stone-400 hover:text-white"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Повторить
            </Button>
          </>
        )}
      </div>

      {/* Результаты анализа */}
      {testResult && (
        <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-stone-500 mb-1">Уровень громкости</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      (() => {
                        if (testResult.volumeLevel < 0.2) return "bg-red-500";
                        if (testResult.volumeLevel < 0.4) return "bg-amber-500";
                        if (testResult.volumeLevel > 0.9) return "bg-orange-500";
                        return "bg-emerald-500";
                      })()
                    )}
                    style={{ width: `${testResult.volumeLevel * 100}%` }}
                  />
                </div>
                <span className="text-xs text-stone-400">
                  {Math.round(testResult.volumeLevel * 100)}%
                </span>
              </div>
            </div>
            
            <div>
              <div className="text-xs text-stone-500 mb-1">Уровень шума</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      (() => {
                        if (testResult.noiseLevel < 0.2) return "bg-emerald-500";
                        if (testResult.noiseLevel < 0.3) return "bg-amber-500";
                        return "bg-red-500";
                      })()
                    )}
                    style={{ width: `${testResult.noiseLevel * 100}%` }}
                  />
                </div>
                <span className="text-xs text-stone-400">
                  {Math.round(testResult.noiseLevel * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Рекомендации */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-stone-400">Рекомендации:</div>
            {testResult.recommendations.map((rec, idx) => (
              <div key={`recommendation-${idx}-${rec.slice(0, 10)}`} className="flex items-start gap-2 text-sm">
                <div className={cn(
                  "w-1 h-1 rounded-full mt-2 flex-shrink-0",
                  (() => {
                    if (testResult.quality === 'good') return 'bg-emerald-500';
                    if (testResult.quality === 'fair') return 'bg-amber-500';
                    return 'bg-red-500';
                  })()
                )} />
                <span className="text-stone-300">{rec}</span>
              </div>
            ))}
          </div>

          {/* Кнопка подтверждения */}
          <Button
            onClick={() => onTestComplete(testResult.quality !== 'poor')}
            className={cn(
              "w-full mt-4",
              testResult.quality === 'poor' 
                ? "bg-stone-700 hover:bg-stone-600" 
                : "bg-emerald-600 hover:bg-emerald-700"
            )}
          >
            {testResult.quality === 'poor' ? 'Продолжить несмотря на предупреждение' : 'Подтвердить и продолжить'}
          </Button>
        </div>
      )}

      {/* Подсказка */}
      {!hasRecording && !isRecording && (
        <div className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-3 flex gap-3">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">
            Проверка микрофона обязательна перед каждым эфиром. Убедитесь, что вы находитесь в тихом месте.
          </p>
        </div>
      )}
    </div>
  );
}
