import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Users, Clock, BookOpen, Heart, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionSummaryProps {
  readonly sessionData: {
    readonly duration: number; // в секундах
    readonly avgListeners: number;
    readonly peakListeners: number;
    readonly chaptersRead: number;
    readonly pagesRead?: number;
    readonly reactionsCount: number;
    readonly positiveReactions: number;
    readonly negativeReactions: number;
  };
  readonly onBackToClub: () => void;
  readonly onPrepareNext?: () => void;
  readonly className?: string;
}

export function SessionSummary({ 
  sessionData, 
  onBackToClub, 
  onPrepareNext, 
  className 
}: SessionSummaryProps) {
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}ч ${mins}м ${secs}с`;
    }
    return `${mins}м ${secs}с`;
  };

  const reactionRatio = sessionData.reactionsCount > 0
    ? (sessionData.positiveReactions / sessionData.reactionsCount) * 100
    : 0;

  return (
    <div className={cn("min-h-screen bg-[#1a1a1a] flex items-center justify-center p-6", className)}>
      <div className="max-w-3xl w-full space-y-6">
        {/* Заголовок */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-4xl font-serif font-bold text-white mb-2">
              Сессия завершена!
            </h1>
            <p className="text-stone-400 text-lg">
              Отличная работа! Вот что удалось достичь
            </p>
          </div>
        </div>

        {/* Основная статистика */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-stone-900/50 border-stone-800">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">
                {formatDuration(sessionData.duration)}
              </div>
              <div className="text-sm text-stone-400">Время в эфире</div>
            </CardContent>
          </Card>

          <Card className="bg-stone-900/50 border-stone-800">
            <CardContent className="p-6 text-center">
              <Users className="w-8 h-8 text-blue-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">
                {sessionData.peakListeners}
              </div>
              <div className="text-sm text-stone-400">
                Пик слушателей
                {' '}
                <span className="block text-xs text-stone-500 mt-1">
                  средний: {sessionData.avgListeners}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-stone-900/50 border-stone-800">
            <CardContent className="p-6 text-center">
              <BookOpen className="w-8 h-8 text-purple-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">
                {sessionData.chaptersRead}
              </div>
              <div className="text-sm text-stone-400">
                {sessionData.chaptersRead === 1 ? 'Глава' : 'Главы'}
                {sessionData.pagesRead && (
                  <span className="block text-xs text-stone-500 mt-1">
                    ~{sessionData.pagesRead} страниц
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Обратная связь */}
        <Card className="bg-stone-900/50 border-stone-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500" />
                Обратная связь
              </h3>
              <Badge 
                variant="outline" 
                className={cn(
                  "border-current",
                  (() => {
                    if (reactionRatio >= 80) return "text-emerald-500";
                    if (reactionRatio >= 60) return "text-amber-500";
                    return "text-stone-500";
                  })()
                )}
              >
                {(() => {
                  if (reactionRatio >= 80) return "Отлично";
                  if (reactionRatio >= 60) return "Хорошо";
                  return "Нормально";
                })()}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-400">Всего реакций</span>
                <span className="font-medium text-white">{sessionData.reactionsCount}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-400">Положительные</span>
                  <span className="font-medium text-white">{sessionData.positiveReactions}</span>
                </div>
                <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${reactionRatio}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-400">Негативные</span>
                  <span className="font-medium text-white">{sessionData.negativeReactions}</span>
                </div>
                <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${100 - reactionRatio}%` }}
                  />
                </div>
              </div>
            </div>

            {reactionRatio >= 80 && (
              <div className="mt-4 p-3 bg-emerald-950/30 border border-emerald-900/30 rounded-lg flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-200">
                  Слушателям очень понравилось ваше чтение! Продолжайте в том же духе.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Совет */}
        <Card className="bg-amber-950/20 border-amber-900/30">
          <CardContent className="p-4">
            <p className="text-sm text-amber-200 text-center">
              💡 <strong>Совет:</strong> Оптимальная длительность сессии — 40-45 минут, 
              чтобы слушатели не уставали
            </p>
          </CardContent>
        </Card>

        {/* Действия */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={onBackToClub}
            variant="outline"
            size="lg"
            className="flex-1 border-stone-600 text-stone-300 hover:bg-stone-800"
          >
            Вернуться в клуб
          </Button>

          {onPrepareNext && (
            <Button
              onClick={onPrepareNext}
              size="lg"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Подготовить следующую главу
            </Button>
          )}
        </div>

        {/* Дополнительная информация */}
        <div className="text-center text-sm text-stone-500">
          <p>Подробная статистика и история сессий доступны в вашем профиле</p>
        </div>
      </div>
    </div>
  );
}
