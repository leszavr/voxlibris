import React from "react";
import { Slider } from "@/components/ui/slider";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  fontSize: number[];
  onFontSizeChange: (value: number[]) => void;
  lineHeight: number[];
  onLineHeightChange: (value: number[]) => void;
  contentWidth: number[];
  onContentWidthChange: (value: number[]) => void;
  micLevel: number;
  isMuted: boolean;
  isStreaming: boolean;
}

export function SettingsPanel({
  fontSize,
  onFontSizeChange,
  lineHeight,
  onLineHeightChange,
  contentWidth,
  onContentWidthChange,
  micLevel,
  isMuted,
  isStreaming,
}: Readonly<SettingsPanelProps>) {
  return (
    <aside className="w-80 border-r border-white/10 bg-[#151515] flex flex-col shrink-0">
      <div className="p-4 border-b border-white/10">
        <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider mb-4">
          Настройки текста
        </h3>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Размер шрифта</span>
              <span className="text-stone-500">{fontSize}px</span>
            </div>
            <Slider
              value={fontSize}
              onValueChange={onFontSizeChange}
              min={14}
              max={32}
              step={1}
              className="[&>.relative>.absolute]:bg-amber-600"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Интервал</span>
              <span className="text-stone-500">{lineHeight[0].toFixed(1)}</span>
            </div>
            <Slider
              value={lineHeight}
              onValueChange={onLineHeightChange}
              min={1.2}
              max={2.5}
              step={0.1}
              className="[&>.relative>.absolute]:bg-amber-600"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Ширина текста</span>
              <span className="text-stone-500">{contentWidth}%</span>
            </div>
            <Slider
              value={contentWidth}
              onValueChange={onContentWidthChange}
              min={60}
              max={95}
              step={5}
              className="[&>.relative>.absolute]:bg-amber-600"
            />
          </div>
        </div>
      </div>

      <div className="p-4 flex-1">
        <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider mb-4">
          Аудио монитор
        </h3>
        <AudioMonitor
          micLevel={micLevel}
          isMuted={isMuted}
          isStreaming={isStreaming}
        />
      </div>
    </aside>
  );
}

interface AudioMonitorProps {
  micLevel: number;
  isMuted: boolean;
  isStreaming: boolean;
}

function AudioMonitor({ micLevel, isMuted, isStreaming }: Readonly<AudioMonitorProps>) {
  const getStatusText = () => {
    if (!isStreaming) return 'Не активен';
    if (isMuted) return 'Микрофон выключен';
    return 'Идет трансляция';
  };

  return (
    <div className="bg-black/40 rounded-lg p-4 border border-white/5 space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span>Входной уровень</span>
        <Mic className="w-4 h-4 text-amber-500" />
      </div>
      
      {/* Audio Visualizer */}
      <div className="flex items-end gap-0.5 h-12 justify-between opacity-80">
        {Array.from({ length: 20 }, (_, idx) => {
          const barHeight = isMuted
            ? 5
            : Math.max(5, (micLevel / 100) * (50 + Math.sin(idx * 0.5) * 20));
          
          return (
            <div
              key={`bar-${idx}`}
              className={cn(
                "w-1.5 rounded-t-sm transition-all duration-75",
                isMuted ? "bg-stone-600" : "bg-amber-500"
              )}
              style={{
                height: `${barHeight}%`,
                opacity: idx > 15 ? 0.3 : 1
              }}
            />
          );
        })}
      </div>
      
      <div className="text-xs text-stone-500 mt-2 text-center">
        {getStatusText()}
      </div>
    </div>
  );
}
