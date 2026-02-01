import React from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { MicrophoneTest } from "./MicrophoneTest";

interface PreparationModalProps {
  showPrepModal: boolean;
  showMicTest: boolean;
  micTestPassed: boolean;
  session: {
    isConnected: boolean;
  };
  isInitialized: boolean;
  onClosePrepModal: () => void;
  onShowMicTest: () => void;
  onCloseMicTest: () => void;
  onMicTestComplete: (passed: boolean) => void;
  onStartReading: () => void;
}

export function PreparationModal({
  showPrepModal,
  showMicTest,
  micTestPassed,
  session,
  isInitialized,
  onClosePrepModal,
  onShowMicTest,
  onCloseMicTest,
  onMicTestComplete,
  onStartReading,
}: Readonly<PreparationModalProps>) {
  if (showMicTest) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center overflow-hidden">
        <div className="bg-[#252525] p-8 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full mx-4 relative">
          <button
            onClick={onCloseMicTest}
            className="absolute top-4 right-4 text-stone-400 hover:text-white transition-colors z-10"
          >
            ✕
          </button>
          <MicrophoneTest
            onTestComplete={(passed) => {
              onMicTestComplete(passed);
              onCloseMicTest();
            }}
          />
        </div>
      </div>
    );
  }

  if (showPrepModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center overflow-hidden">
        <div className="bg-[#252525] p-8 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full mx-4 text-center space-y-6 relative">
          <button
            onClick={onClosePrepModal}
            className="absolute top-4 right-4 text-stone-400 hover:text-white transition-colors z-10"
          >
            ✕
          </button>
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500">
            <Mic className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-white mb-2">Готовы к эфиру?</h2>
            <p className="text-stone-400">Проверьте микрофон и настройки текста перед началом. Ваши слушатели уже ждут.</p>
          </div>

          {/* Чек-лист готовности */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4 space-y-2 text-left">
            <ReadinessCheckItem
              checked={session.isConnected}
              label="Соединение установлено"
            />
            <ReadinessCheckItem
              checked={isInitialized}
              label="Сессия создана"
            />
            <ReadinessCheckItem
              checked={micTestPassed}
              label="Микрофон проверен"
            />
          </div>

          {!micTestPassed && (
            <Button
              size="lg"
              variant="outline"
              className="w-full border-amber-600 text-amber-500 hover:bg-amber-950/20"
              onClick={onShowMicTest}
            >
              <Mic className="w-4 h-4 mr-2" />
              Проверить микрофон
            </Button>
          )}

          <Button
            size="lg"
            className="w-full bg-amber-600 hover:bg-amber-700 text-white border-none h-12 text-lg"
            onClick={onStartReading}
            disabled={!session.isConnected || !isInitialized || !micTestPassed}
          >
            {getStartButtonText(session.isConnected, micTestPassed)}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

interface ReadinessCheckItemProps {
  checked: boolean;
  label: string;
}

function ReadinessCheckItem({ checked, label }: Readonly<ReadinessCheckItemProps>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-5 h-5 rounded flex items-center justify-center ${
        checked ? 'bg-emerald-600' : 'bg-stone-700'
      }`}>
        {checked && '✓'}
      </div>
      <span className={checked ? 'text-stone-300' : 'text-stone-500'}>
        {label}
      </span>
    </div>
  );
}

function getStartButtonText(isConnected: boolean, micTestPassed: boolean): string {
  if (!isConnected) return "Подключение...";
  if (!micTestPassed) return "Требуется проверка микрофона";
  return "Начать прямой эфир";
}
