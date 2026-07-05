import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import type { Bookmark as BookmarkType } from "@shared/schema";
import type { ReaderSettings } from "@/lib/reader-settings";

import { BookmarksPanel } from "../BookmarksPanel";
import { LoadingIndicator } from "../LoadingIndicator";
import { ClubChapterList } from "./ClubNavigation";
import { ClubReaderControls } from "./ClubReaderControls";

interface ClubReaderPanelsProps {
  readonly settingsOpen: boolean;
  readonly tocOpen: boolean;
  readonly bookmarksOpen: boolean;
  readonly settingsPanelRef: RefObject<HTMLDivElement | null>;
  readonly tocPanelRef: RefObject<HTMLDivElement | null>;
  readonly bookmarksPanelRef: RefObject<HTMLDivElement | null>;
  readonly settings: ReaderSettings;
  readonly updateSettingsWithAnchor: (settings: ReaderSettings) => void;
  readonly resetSettingsWithAnchor: () => void;
  readonly chapters: Parameters<typeof ClubChapterList>[0]["chapters"];
  readonly currentChapter: number | null;
  readonly changeChapter: (chapter: number) => void;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly setTocOpen: (open: boolean) => void;
  readonly setBookmarksOpen: (open: boolean) => void;
  readonly bookmarksLoading: boolean;
  readonly bookId: string;
  readonly normalizedBookmarks: BookmarkType[];
  readonly navigateToBookmark: (bookmark: BookmarkType) => void;
}

export function ClubReaderPanels({
  settingsOpen,
  tocOpen,
  bookmarksOpen,
  settingsPanelRef,
  tocPanelRef,
  bookmarksPanelRef,
  settings,
  updateSettingsWithAnchor,
  resetSettingsWithAnchor,
  chapters,
  currentChapter,
  changeChapter,
  setSettingsOpen,
  setTocOpen,
  setBookmarksOpen,
  bookmarksLoading,
  bookId,
  normalizedBookmarks,
  navigateToBookmark,
}: ClubReaderPanelsProps) {
  return (
    <>
      {/* Модальное окно настроек */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end pointer-events-none"
        >
          <div
            ref={settingsPanelRef}
            className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-2 sm:mr-4"
          >
            <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between">
              <h2 className="text-sm sm:text-lg font-semibold">Настройки</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-3 sm:p-4">
              <ClubReaderControls
                settings={settings}
                onSettingsChange={updateSettingsWithAnchor}
                onResetSettings={resetSettingsWithAnchor}
              />
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно оглавления */}
      {tocOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end pointer-events-none"
        >
          <div
            ref={tocPanelRef}
            className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-2 sm:mr-4 flex flex-col"
          >
            <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between flex-none">
              <h2 className="text-sm sm:text-lg font-semibold">Оглавление</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTocOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-3 sm:p-4 flex-1">
              <ClubChapterList
                chapters={chapters}
                currentChapter={currentChapter || 1}
                onChapterSelect={(chapter) => {
                  changeChapter(chapter);
                  setTocOpen(false);
                }}
                isVisible={tocOpen}
                onClose={() => setTocOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно закладок */}
      {bookmarksOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end pointer-events-none"
        >
          <div
            ref={bookmarksPanelRef}
            className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-2 sm:mr-4 flex flex-col"
          >
            <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between flex-none">
              <h2 className="text-sm sm:text-lg font-semibold">Закладки</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBookmarksOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-3 sm:p-4 flex-1">
              {bookmarksLoading ? (
                <LoadingIndicator message="Загрузка..." />
              ) : (
                <BookmarksPanel
                  bookId={bookId}
                  bookmarks={normalizedBookmarks}
                  onNavigateToBookmark={(bookmark) => {
                    navigateToBookmark(bookmark);
                    setBookmarksOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
