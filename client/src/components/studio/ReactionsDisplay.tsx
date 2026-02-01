import { useState, useEffect, useCallback } from 'react';
import { Heart, ThumbsUp, Flame, Star, ThumbsDown, Frown, AlertCircle, Meh } from 'lucide-react';
import { cn } from '@/lib/utils';

// Типы реакций согласно ТЗ: 4 положительные + 4 отрицательные
export const REACTION_TYPES = {
  // Положительные
  heart: { icon: Heart, label: 'Нравится', color: 'text-rose-500', positive: true },
  thumbsUp: { icon: ThumbsUp, label: 'Супер', color: 'text-emerald-500', positive: true },
  fire: { icon: Flame, label: 'Огонь', color: 'text-orange-500', positive: true },
  star: { icon: Star, label: 'Отлично', color: 'text-amber-500', positive: true },
  
  // Отрицательные
  thumbsDown: { icon: ThumbsDown, label: 'Не нравится', color: 'text-red-500', positive: false },
  meh: { icon: Meh, label: 'Скучно', color: 'text-stone-500', positive: false },
  frown: { icon: Frown, label: 'Грустно', color: 'text-blue-500', positive: false },
  warning: { icon: AlertCircle, label: 'Внимание', color: 'text-yellow-500', positive: false },
} as const;

export type ReactionType = keyof typeof REACTION_TYPES;

interface ReactionParticle {
  id: string;
  type: ReactionType;
  x: number;
  y: number;
  startTime: number;
}

interface ReactionsDisplayProps {
  readonly reactions: Array<{ type: ReactionType; userId: string; timestamp: number }>;
  readonly className?: string;
  readonly showControls?: boolean;
  readonly onReactionSend?: (type: ReactionType) => void;
}

export function ReactionsDisplay({ 
  reactions, 
  className, 
  showControls = false,
  onReactionSend 
}: ReactionsDisplayProps) {
  const [particles, setParticles] = useState<ReactionParticle[]>([]);
  const [canSend, setCanSend] = useState(true);

  // Функция для удаления частицы
  const removeParticle = useCallback((particleId: string) => {
    setParticles(prev => prev.filter(p => p.id !== particleId));
  }, []);

  // Добавляем новые реакции как частицы
  useEffect(() => {
    if (reactions.length === 0) return;

    const latestReaction = reactions.at(-1)!;
    const newParticle: ReactionParticle = {
      id: `${latestReaction.userId}-${latestReaction.timestamp}`,
      type: latestReaction.type,
      x: Math.random() * 80 + 10, // 10-90% ширины
      y: 100, // Начинаем снизу
      startTime: Date.now()
    };

    setParticles(prev => [...prev, newParticle]);

    // Удаляем частицу через 3 секунды
    setTimeout(() => {
      removeParticle(newParticle.id);
    }, 3000);
  }, [reactions, removeParticle]);

  // Обработка отправки реакции с флуд-контролем (1 реакция/10 сек)
  const handleSendReaction = (type: ReactionType) => {
    if (!canSend || !onReactionSend) return;

    onReactionSend(type);
    setCanSend(false);

    // Разрешаем снова через 10 секунд
    setTimeout(() => setCanSend(true), 10000);
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Анимированные частицы реакций */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((particle) => {
          const ReactionIcon = REACTION_TYPES[particle.type].icon;
          const color = REACTION_TYPES[particle.type].color;
          const age = Date.now() - particle.startTime;
          const progress = Math.min(age / 3000, 1); // 3 секунды анимация
          const yPos = 100 - progress * 100; // Движение вверх
          const opacity = 1 - progress; // Затухание

          return (
            <div
              key={particle.id}
              className="absolute transition-all duration-100"
              style={{
                left: `${particle.x}%`,
                bottom: `${yPos}%`,
                opacity,
                transform: `scale(${1 + progress * 0.5})` // Немного увеличиваем
              }}
            >
              <ReactionIcon 
                className={cn("w-6 h-6 drop-shadow-lg", color)} 
                fill="currentColor"
              />
            </div>
          );
        })}
      </div>

      {/* Панель управления реакциями (для слушателей) */}
      {showControls && (
        <div className="relative z-10 bg-stone-900/80 backdrop-blur-sm rounded-lg p-3 border border-stone-800">
          <div className="text-xs text-stone-400 mb-2 text-center">
            Реакции {!canSend && '(подождите 10 сек)'}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(REACTION_TYPES)
              .filter(([, config]) => config.positive)
              .map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => handleSendReaction(type as ReactionType)}
                    disabled={!canSend}
                    className={cn(
                      "p-2 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      config.color
                    )}
                    title={config.label}
                  >
                    <Icon className="w-5 h-5 mx-auto" />
                  </button>
                );
              })}
          </div>
          
          {/* Отрицательные реакции (скрыты за раскрытием) */}
          <details className="mt-2">
            <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-400 text-center">
              Другие реакции
            </summary>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {Object.entries(REACTION_TYPES)
                .filter(([, config]) => !config.positive)
                .map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleSendReaction(type as ReactionType)}
                      disabled={!canSend}
                      className={cn(
                        "p-2 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        config.color
                      )}
                      title={config.label}
                    >
                      <Icon className="w-5 h-5 mx-auto" />
                    </button>
                  );
                })}
            </div>
          </details>
        </div>
      )}

      {/* Статистика реакций */}
      {!showControls && reactions.length > 0 && (
        <div className="relative z-10 flex items-center justify-center gap-4 text-sm">
          {(() => {
            const reactionCounts = reactions.reduce((acc, r) => {
              acc[r.type] = (acc[r.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            
            return Object.entries(reactionCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4)
              .map(([type, count]) => {
                const config = REACTION_TYPES[type as ReactionType];
                const Icon = config.icon;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <Icon className={cn("w-4 h-4", config.color)} />
                    <span className="text-stone-400">{count}</span>
                  </div>
                );
              });
          })()}
        </div>
      )}
    </div>
  );
}
