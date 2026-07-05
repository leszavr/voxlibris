import { ArrowLeft, HelpCircle, List, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ClubReaderTopBarProps {
  readonly title: string;
  readonly readerBlockedByStudioDevice: boolean;
  readonly tocOpen: boolean;
  readonly settingsOpen: boolean;
  readonly closeAllPanels: () => void;
  readonly setTocOpen: (open: boolean) => void;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly setHelpOpen: (open: boolean) => void;
}

export function ClubReaderTopBar(props: ClubReaderTopBarProps) {
  return (
      <section className={cn("border-b bg-background relative z-50 p-2 sm:p-4 shrink-0 transition-[filter,opacity] duration-300", props.readerBlockedByStudioDevice && "pointer-events-none select-none blur-sm opacity-60")}>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" onClick={() => globalThis.history.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold truncate">{props.title}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Клубное чтение</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={props.readerBlockedByStudioDevice}
              onClick={() => {
                const nextOpen = !props.tocOpen;
                props.closeAllPanels();
                props.setTocOpen(nextOpen);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 shrink-0"
            >
              <List className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              disabled={props.readerBlockedByStudioDevice}
              onClick={() => {
                const nextOpen = !props.settingsOpen;
                props.closeAllPanels();
                props.setSettingsOpen(nextOpen);
              }}
              title="Настройки чтения"
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 shrink-0"
            >
              <Settings className="w-4 h-4" />
            </Button>
            
            {/* Закладки временно скрыты до включения функционала в UI
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookmarksOpen(!bookmarksOpen)}
              title="Закладки"
              className="w-8 h-8 sm:w-10 sm:h-10 p-0"
            >
              <Bookmark className="w-4 h-4" />
            </Button>
            */}
            
            <Button
              variant="outline"
              size="sm"
              disabled={props.readerBlockedByStudioDevice}
              onClick={() => props.setHelpOpen(true)}
              title="Горячие клавиши"
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 hidden"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
        </section>
  );
}
