import React from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Play, Pause, Square, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionState = "prep" | "live" | "paused" | "summary";

interface FloatingControlsProps {
  state: SessionState;
  isMuted: boolean;
  onToggleMute: () => void;
  onPauseReading: () => void;
  onResumeReading: () => void;
  onEndReading: () => void;
}

export function FloatingControls({
  state,
  isMuted,
  onToggleMute,
  onPauseReading,
  onResumeReading,
  onEndReading,
}: FloatingControlsProps) {
  if (state === "prep" || state === "summary") {
    return null;
  }

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#252525] border border-white/10 p-2 rounded-full shadow-2xl z-30">
      {state === "live" && (
        <LiveControls
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onPauseReading={onPauseReading}
          onEndReading={onEndReading}
        />
      )}
      {state === "paused" && (
        <PausedControls
          onResumeReading={onResumeReading}
          onEndReading={onEndReading}
        />
      )}
    </div>
  );
}

interface LiveControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onPauseReading: () => void;
  onEndReading: () => void;
}

function LiveControls({
  isMuted,
  onToggleMute,
  onPauseReading,
  onEndReading,
}: LiveControlsProps) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "rounded-full hover:bg-white/5",
          isMuted ? "text-red-500 hover:text-red-400" : "text-stone-400 hover:text-white"
        )}
        onClick={onToggleMute}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="rounded-full h-12 w-12 p-0 bg-amber-600 hover:bg-amber-700 border-none text-white"
        onClick={onPauseReading}
      >
        <Pause className="w-5 h-5" />
      </Button>
      <Button
        variant="destructive"
        size="lg"
        className="rounded-full h-12 w-12 p-0"
        onClick={onEndReading}
      >
        <Square className="w-4 h-4 fill-current" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full hover:bg-white/5 text-stone-400 hover:text-white"
      >
        <Settings className="w-5 h-5" />
      </Button>
    </>
  );
}

interface PausedControlsProps {
  onResumeReading: () => void;
  onEndReading: () => void;
}

function PausedControls({
  onResumeReading,
  onEndReading,
}: PausedControlsProps) {
  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        className="rounded-full h-12 w-12 p-0 bg-emerald-600 hover:bg-emerald-700 border-none text-white"
        onClick={onResumeReading}
      >
        <Play className="w-5 h-5 fill-current ml-1" />
      </Button>
      <Button
        variant="destructive"
        size="lg"
        className="rounded-full h-12 w-12 p-0"
        onClick={onEndReading}
      >
        <Square className="w-4 h-4 fill-current" />
      </Button>
    </>
  );
}
