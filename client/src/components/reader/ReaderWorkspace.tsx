import { useState, useEffect, useRef, useCallback, useMemo, type ComponentProps, type RefObject } from "react";
import { useLocation, useParams } from "wouter";
import { useAnalytics } from "../../hooks/use-analytics";
import { useAddBookmark, useBookmarks, useDeleteBookmark } from "../../hooks/use-reader";
import { BookmarksPanel } from "./BookmarksPanel";
import { LatestPositionPrompt } from "./LatestPositionPrompt";
import { ReaderControls } from "./ReaderControls";
import { SelectionBookmarkPrompt } from "./SelectionBookmarkPrompt";
import { Button } from "../ui/button";
import { Maximize2, Minimize2, List, Settings, ArrowLeft, Bookmark } from "lucide-react";
import {
  useDebouncedReaderProgressSave,
  useRestoreReaderScroll,
} from "./core/use-reader-progress-sync";
import { useReaderLatestProgress } from "./core/use-reader-latest-progress";
import { useReaderPanelsAutoclose } from "./core/use-reader-panels-autoclose";
import { useReaderSelectionBookmark } from "./core/use-reader-selection-bookmark";
import { useSmoothReaderSpaceScroll } from "./core/use-smooth-reader-space-scroll";
import { usePreserveReaderVisualAnchor } from "./core/use-preserve-reader-visual-anchor";
import { usePersonalReaderAdapter } from "./core/use-reader-data-adapters";
import { useSyncedReaderSettings } from "./core/use-synced-reader-settings";
import { useReaderSyncState } from "./core/use-reader-sync-state";
import { ReaderProgressIndicators } from "./ReaderProgressIndicators";
import { applyReaderSettings, type ReaderSettings } from "@/lib/reader-settings";
import { ReaderMainContent } from "./workspace/main-content";
import { getInitialChapter } from "./workspace/utils";
import { usePendingBookmarkNavigation, usePendingScrollRestore, usePersistProgressOnUnmount, useReaderChapterNavigation, useReaderSavedPositionActions, useTrackReaderAnalytics } from "./workspace/hooks";
import type { Chapter, PendingScrollRestore, ProcessedBookData } from "./workspace/types";

interface ReaderWorkspaceProps {
  bookId?: string;
  clubId?: string;
  params?: {
    bookId?: string;
  };
}

function ReaderWorkspaceView({
  onBackToLibrary,
  selectionState,
  addBookmarkFromSelection,
  clearSelection,
  suggestedProgress,
  currentChapter,
  openLatestPosition,
  dismissSuggestion,
  tocOpen,
  closeAllPanels,
  setTocOpen,
  changeChapter,
  bookData,
  bookmarksOpen,
  setBookmarksOpen,
  bookmarksLoading,
  bookId,
  bookmarks,
  isAddingBookmark,
  createCurrentBookmarkDraft,
  addBookmark,
  deleteBookmark,
  navigateToBookmark,
  settingsOpen,
  setSettingsOpen,
  settings,
  updateSettingsWithAnchor,
  previewSettings,
  resetSettingsWithAnchor,
  isFullscreen,
  toggleFullscreen,
  scrollContainerRef,
  scheduleProgressSave,
  contentAreaRef,
  tocPanelRef,
  bookmarksPanelRef,
  settingsPanelRef,
  mainContent,
  isSyncing,
  lastSyncTime,
  syncError,
  progress,
}: Readonly<{
  onBackToLibrary: () => void;
  selectionState: { text: string; top: number; left: number } | null;
  addBookmarkFromSelection: () => void;
  clearSelection: () => void;
  suggestedProgress: { currentChapter: number; currentPosition: string } | null;
  currentChapter: number;
  openLatestPosition: () => void;
  dismissSuggestion: () => void;
  tocOpen: boolean;
  closeAllPanels: () => void;
  setTocOpen: (open: boolean) => void;
  changeChapter: (chapter: number) => void;
  bookData: ProcessedBookData;
  bookmarksOpen: boolean;
  setBookmarksOpen: (open: boolean) => void;
  bookmarksLoading: boolean;
  bookId: string;
  bookmarks: ComponentProps<typeof BookmarksPanel>["bookmarks"];
  isAddingBookmark: boolean;
  createCurrentBookmarkDraft: () => { chapterNumber: number; position: string } | null;
  addBookmark: (data: { chapterNumber?: number; position: string; title?: string }) => void;
  deleteBookmark: (bookmarkId: string) => void;
  navigateToBookmark: (positionRaw: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settings: ReaderSettings;
  updateSettingsWithAnchor: (nextSettings: ReaderSettings) => void;
  previewSettings: (nextSettings: ReaderSettings) => void;
  resetSettingsWithAnchor: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scheduleProgressSave: () => void;
  contentAreaRef: RefObject<HTMLDivElement | null>;
  tocPanelRef: RefObject<HTMLDivElement | null>;
  bookmarksPanelRef: RefObject<HTMLDivElement | null>;
  settingsPanelRef: RefObject<HTMLDivElement | null>;
  mainContent: React.ReactNode;
  isSyncing: boolean;
  lastSyncTime: number | null;
  syncError: string | null;
  progress: { currentChapter: number; currentPosition: string; progress: number } | null;
}>) {
  const tocActiveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (tocOpen) {
      tocActiveRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [tocOpen]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {selectionState && (
        <SelectionBookmarkPrompt
          text={selectionState.text}
          top={selectionState.top}
          left={selectionState.left}
          onConfirm={addBookmarkFromSelection}
          onDismiss={clearSelection}
        />
      )}
      {suggestedProgress && (
        <LatestPositionPrompt
          currentChapter={currentChapter}
          remoteChapter={suggestedProgress.currentChapter}
          onOpenLatest={openLatestPosition}
          onDismiss={dismissSuggestion}
        />
      )}

      <header className="border-b bg-background relative z-50">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 p-2 sm:p-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToLibrary}
              className="text-xs sm:text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Библиотека</span>
            </Button>

            <div className="relative">
              <Button
                variant={tocOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  const nextOpen = !tocOpen;
                  closeAllPanels();
                  setTocOpen(nextOpen);
                }}
                className="text-xs sm:text-sm"
              >
                <List className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Оглавление</span>
              </Button>
            </div>
            {tocOpen && (
              <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
                <div ref={tocPanelRef} className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mt-14 mr-2 sm:mr-4 flex flex-col">
                  <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between flex-none">
                    <h3 className="font-semibold text-base sm:text-lg">Оглавление</h3>
                    <Button variant="ghost" size="sm" onClick={() => setTocOpen(false)}>✕</Button>
                  </div>
                  <div className="p-2 sm:p-3 flex-1 space-y-0.5">
                    {bookData.isPersonalBook && bookData.chapters ? (
                      bookData.chapters.map((chapter: Chapter) => {
                        const isActive = currentChapter === chapter.chapterNumber;
                        return (
                          <Button
                            key={chapter.chapterNumber}
                            ref={isActive ? tocActiveRef : undefined}
                            variant={isActive ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-2 px-3"
                            onClick={() => {
                              changeChapter(chapter.chapterNumber);
                              setTocOpen(false);
                            }}
                          >
                            <div className="flex flex-col items-start">
                              <span className="font-medium text-sm">{chapter.title || `Глава ${chapter.chapterNumber}`}</span>
                              {chapter.title && (
                                <span className="text-xs text-muted-foreground mt-0.5">Глава {chapter.chapterNumber}</span>
                              )}
                            </div>
                          </Button>
                        );
                      })
                    ) : (
                      <Button
                        ref={tocActiveRef}
                        variant={currentChapter === 1 ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => {
                          changeChapter(1);
                          setTocOpen(false);
                        }}
                      >
                        Глава 1
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <Button
                variant={bookmarksOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  const nextOpen = !bookmarksOpen;
                  closeAllPanels();
                  setBookmarksOpen(nextOpen);
                }}
                className="text-xs sm:text-sm"
              >
                <Bookmark className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Закладки</span>
              </Button>
              {bookmarksOpen && (
                <div ref={bookmarksPanelRef} className="absolute left-0 top-full mt-2 w-[85vw] max-w-[360px] sm:w-96 max-h-96 overflow-y-auto bg-background text-foreground border rounded-md shadow-lg p-3 sm:p-4 z-50">
                  {bookmarksLoading ? (
                    <p className="text-sm text-muted-foreground">Загрузка закладок...</p>
                  ) : (
                    <BookmarksPanel
                      bookId={bookId}
                      bookmarks={bookmarks}
                      isCreatingBookmark={isAddingBookmark}
                      getCurrentBookmarkDraft={createCurrentBookmarkDraft}
                      onCreateBookmark={(bookmarkData) => addBookmark(bookmarkData)}
                      onDeleteBookmark={(bookmarkId) => deleteBookmark(bookmarkId)}
                      onNavigateToBookmark={(bookmark) => {
                        navigateToBookmark(bookmark.position);
                        setBookmarksOpen(false);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <div className="text-right hidden sm:block">
              <h1 className="text-sm sm:text-lg font-semibold truncate max-w-[120px] sm:max-w-none">
                {bookData.title}
              </h1>
              <p className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-none">
                {bookData.isPersonalBook && bookData.chapters
                  ? bookData.chapters.find((ch: Chapter) => ch.chapterNumber === currentChapter)?.title || `Глава ${currentChapter}`
                  : `Глава ${currentChapter}`}
              </p>
            </div>
            <div className="text-left sm:hidden">
              <p className="text-xs text-muted-foreground">
                Глава {currentChapter}
              </p>
            </div>

            <div className="relative">
              <Button
                variant={settingsOpen ? "secondary" : "ghost"}
                size="icon"
                onClick={() => {
                  const nextOpen = !settingsOpen;
                  closeAllPanels();
                  setSettingsOpen(nextOpen);
                }}
                title="Настройки чтения"
                className="w-8 h-8 sm:w-10 sm:h-10"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              {settingsOpen && (
                <div ref={settingsPanelRef} className="absolute right-0 top-full mt-2 w-[85vw] max-w-[320px] sm:w-80 bg-background text-foreground border rounded-md shadow-lg p-3 sm:p-4 z-50">
                  <ReaderControls
                    settings={settings}
                    onSettingsChange={updateSettingsWithAnchor}
                    onPreviewSettings={previewSettings}
                    onResetSettings={resetSettingsWithAnchor}
                  />
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main
        ref={scrollContainerRef}
        onScroll={scheduleProgressSave}
        className="flex-1 overflow-y-auto bg-background text-foreground"
        data-reader-surface-theme={settings.theme}
      >
        <div
          ref={contentAreaRef}
          className="mx-auto px-3 sm:px-4 md:px-8 py-8 sm:py-12 reader-text-align"
          style={{
            width: "var(--reader-content-width, 90%)"
          }}
        >
          {mainContent}
        </div>
      </main>

      <ReaderProgressIndicators
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        error={syncError}
        userProgress={progress}
      />
    </div>
  );
}

export function ReaderWorkspace({ bookId: propBookId, clubId, params }: Readonly<ReaderWorkspaceProps>) {
  const [, setLocation] = useLocation();
  const routeParams = useParams();
  const bookId = propBookId || params?.bookId || routeParams.bookId;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<number | null>(null); // null пока не загрузится progress
  const [tocOpen, setTocOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingScrollRestore, setPendingScrollRestore] = useState<PendingScrollRestore | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const manualRestoreCleanupRef = useRef<(() => void) | null>(null);
  const { bookmarks, isLoading: bookmarksLoading } = useBookmarks(bookId || "");
  const { mutate: addBookmark, isPending: isAddingBookmark } = useAddBookmark(bookId || "");
  const { mutate: deleteBookmark } = useDeleteBookmark(bookId || "");

  const {
    progress,
    progressLoading,
    refetchProgress,
    contentLoading,
    bookData,
    currentChapterContent,
    saveProgress,
  } = usePersonalReaderAdapter({
    bookId,
    currentChapter,
    clubId,
  });
  const {
    saveWithSync,
    isLocalSessionProgress,
    isSyncing,
    syncError,
    lastSyncTime,
  } = useReaderSyncState({ saveProgress });
  const {
    settings,
    updateSettings,
    resetSettings,
    syncStatus: _syncStatus,
    isLoading: _isLoadingReaderSettings,
    // isSaving is deprecated, replaced with syncStatus
  } = useSyncedReaderSettings("personal");
  
  // Analytics hooks
  const analytics = useAnalytics();
  
  // Инициализация currentChapter из прогресса при первой загрузке
  useEffect(() => {
    if (currentChapter !== null) return;
    const initial = getInitialChapter(progress, progressLoading);
    if (initial !== null) {
      setCurrentChapter(initial);
    }
  }, [progress, progressLoading, currentChapter]);

  useTrackReaderAnalytics({
    bookId,
    currentChapter,
    contentLoading,
    progress: progress ?? null,
    analytics
  });

  const scrollElementRef = scrollContainerRef as RefObject<HTMLElement | null>;
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const tocPanelRef = useRef<HTMLDivElement | null>(null);
  const bookmarksPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const closeAllPanels = useCallback(() => {
    setTocOpen(false);
    setBookmarksOpen(false);
    setSettingsOpen(false);
  }, []);
  const preserveReaderVisualAnchor = usePreserveReaderVisualAnchor({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
  });

  const previewSettings = useCallback((nextSettings: ReaderSettings) => {
    preserveReaderVisualAnchor(() => {
      applyReaderSettings(nextSettings, "personal");
    });
  }, [preserveReaderVisualAnchor]);

  const updateSettingsWithAnchor = useCallback((nextSettings: ReaderSettings) => {
    preserveReaderVisualAnchor(() => {
      updateSettings(nextSettings);
    });
  }, [preserveReaderVisualAnchor, updateSettings]);

  const resetSettingsWithAnchor = useCallback(() => {
    preserveReaderVisualAnchor(() => {
      resetSettings();
    });
  }, [preserveReaderVisualAnchor, resetSettings]);

  useReaderPanelsAutoclose({
    isOpen: tocOpen || bookmarksOpen || settingsOpen,
    onClose: closeAllPanels,
    contentRef: scrollElementRef,
    protectedRefs: [tocPanelRef, bookmarksPanelRef, settingsPanelRef],
  });

  const { suggestedProgress, dismissSuggestion } = useReaderLatestProgress({
    currentChapter,
    totalChapters: bookData.totalChapters,
    scrollContainerRef: scrollElementRef,
    remoteProgress: progress ?? null,
    refreshProgress: refetchProgress,
    enabled: currentChapter !== null && !progressLoading && bookData.totalChapters > 0,
    isLocalSessionProgress,
  });

  const { scheduleSave: scheduleProgressSave, saveNow: saveProgressNow } = useDebouncedReaderProgressSave({
    currentChapter,
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    totalChapters: bookData.totalChapters,
    onSave: saveWithSync,
    debounceMs: 1500,
    enabled: currentChapter !== null && bookData.totalChapters > 0,
  });

  useRestoreReaderScroll({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    currentChapter,
    currentPositionRaw: progress?.currentPosition,
    contentReady: !contentLoading,
  });
  useSmoothReaderSpaceScroll({
    scrollContainerRef: scrollElementRef,
    enabled: currentChapter !== null,
  });
  const { selectionState, clearSelection } = useReaderSelectionBookmark({
    containerRef: scrollElementRef,
    enabled: currentChapter !== null && !contentLoading,
  });

  usePersistProgressOnUnmount({
    scrollContainerRef,
    bookData,
    currentChapter,
    contentLoading,
    clubId,
    bookId
  });

  usePendingBookmarkNavigation({
    bookId,
    currentChapter,
    setPendingScrollRestore,
    setCurrentChapter,
  });

  usePendingScrollRestore({
    pendingScrollRestore,
    contentLoading,
    currentChapter,
    scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    manualRestoreCleanupRef,
    setPendingScrollRestore,
  });

  // Fullscreen API
  const toggleFullscreen = () => {
    const isActive = !!document.fullscreenElement;
    if (isActive) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const { changeChapter } = useReaderChapterNavigation({
    currentChapter,
    chaptersLength: bookData.chapters?.length,
    scrollContainerRef,
    saveProgressNow,
    setCurrentChapter,
  });

  const {
    createCurrentBookmarkDraft,
    navigateToBookmark,
    addBookmarkFromSelection,
    openLatestPosition,
  } = useReaderSavedPositionActions({
    scrollContainerRef,
    currentChapter,
    totalChapters: bookData.totalChapters,
    selectionState,
    clearSelection,
    addBookmark,
    suggestedProgress,
    dismissSuggestion,
    setPendingScrollRestore,
    setCurrentChapter,
  });

  const handleMarkAsRead = useCallback(() => {
    saveProgressNow({
      chapter: currentChapter ?? 1,
      progressOverride: 100,
    });
  }, [currentChapter, saveProgressNow]);

  const mainContent = useMemo(() => (
    <ReaderMainContent
      contentLoading={contentLoading}
      currentChapterContent={currentChapterContent}
      currentChapter={currentChapter}
      bookData={bookData}
      setCurrentChapter={changeChapter}
      onMarkAsRead={handleMarkAsRead}
    />
  ), [
    contentLoading,
    currentChapterContent,
    currentChapter,
    bookData,
    changeChapter,
    handleMarkAsRead,
  ]);

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground">Книга не найдена</p>
      </div>
    );
  }

  // Показываем загрузку пока определяется глава
  if (currentChapter === null || progressLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <ReaderWorkspaceView
      onBackToLibrary={() => setLocation("/library")}
      selectionState={selectionState}
      addBookmarkFromSelection={addBookmarkFromSelection}
      clearSelection={clearSelection}
      suggestedProgress={suggestedProgress}
      currentChapter={currentChapter}
      openLatestPosition={openLatestPosition}
      dismissSuggestion={dismissSuggestion}
      tocOpen={tocOpen}
      closeAllPanels={closeAllPanels}
      setTocOpen={setTocOpen}
      changeChapter={changeChapter}
      bookData={bookData}
      bookmarksOpen={bookmarksOpen}
      setBookmarksOpen={setBookmarksOpen}
      bookmarksLoading={bookmarksLoading}
      bookId={bookId}
      bookmarks={bookmarks}
      isAddingBookmark={isAddingBookmark}
      createCurrentBookmarkDraft={createCurrentBookmarkDraft}
      addBookmark={addBookmark}
      deleteBookmark={deleteBookmark}
      navigateToBookmark={navigateToBookmark}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      settings={settings}
      updateSettingsWithAnchor={updateSettingsWithAnchor}
      previewSettings={previewSettings}
      resetSettingsWithAnchor={resetSettingsWithAnchor}
      isFullscreen={isFullscreen}
      toggleFullscreen={toggleFullscreen}
      scrollContainerRef={scrollContainerRef}
      scheduleProgressSave={scheduleProgressSave}
      contentAreaRef={contentAreaRef}
      tocPanelRef={tocPanelRef}
      bookmarksPanelRef={bookmarksPanelRef}
      settingsPanelRef={settingsPanelRef}
      mainContent={mainContent}
      isSyncing={isSyncing}
      lastSyncTime={lastSyncTime}
      syncError={syncError}
      progress={progress}
    />
  );
}
