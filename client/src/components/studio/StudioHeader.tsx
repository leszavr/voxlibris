import React from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type SessionState = "prep" | "live" | "paused" | "summary";

interface StudioHeaderProps {
  state: SessionState;
  listenerCount: number;
  elapsedTime: number;
  bookTitle?: string;
  currentChapter: number;
  clubId: string;
  onBackToClub: () => void;
}

export function StudioHeader({
  state,
  listenerCount,
  elapsedTime,
  bookTitle = "Мастер и Маргарита",
  currentChapter,
  clubId,
  onBackToClub,
}: Readonly<StudioHeaderProps>) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#1a1a1a] z-10 shrink-0">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToClub}
          className="text-stone-400 hover:text-stone-200 hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 font-serif font-bold text-lg text-amber-500">
          <span>VoxLibris</span>
          <span className="text-xs font-sans font-normal text-stone-500 uppercase tracking-widest border border-stone-700 px-1.5 py-0.5 rounded">
            Студия
          </span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-white/10" />
        <div className="text-sm text-stone-400">
          <span className="font-medium text-stone-200">{bookTitle}</span>
          <span className="mx-2">·</span>
          Глава {currentChapter}
        </div>
      </div>

      <div className="flex items-center gap-6">
        {state === "live" && (
          <LiveIndicator />
        )}

        <div className="flex items-center gap-4 text-sm font-medium tabular-nums">
          <div className="flex items-center gap-2 text-stone-400">
            <UsersIcon className="w-4 h-4" />
            <span className={state === "live" ? "text-stone-200" : ""}>
              {listenerCount}
            </span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="text-amber-500">
            {formatTime(elapsedTime)}
          </div>
        </div>
      </div>
    </header>
  );
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      <div className="w-2 h-2 rounded-full bg-red-500" />
      <span className="text-red-500 font-bold text-sm tracking-wide">В ЭФИРЕ</span>
    </div>
  );
}

function UsersIcon(props: Readonly<React.SVGProps<SVGSVGElement>>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
