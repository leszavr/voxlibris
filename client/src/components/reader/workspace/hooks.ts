import { useCallback, useEffect, useRef, type RefObject } from "react";
import { getMobileAnalyticsContext } from "@/lib/mobile-analytics";
import { getAccessToken } from "@/lib/token-store";
import { saveReaderProgressToStorage } from "@/lib/reader-local-progress";
import { toast } from "@/hooks/use-toast";

import { useAnalytics } from "../../../hooks/use-analytics";
import { consumePendingReaderBookmarkNavigation } from "@/lib/reader-bookmark-navigation";
import { createReaderProgressPayload, parseReaderPosition } from "../core/reader-progress-core";
import { restoreReaderScrollPosition } from "../core/use-reader-progress-sync";
import { readerShortcuts, useKeyboardShortcuts } from "../useKeyboardShortcuts";
import type { PendingScrollRestore, ProcessedBookData } from "./types";
import { createBookmarkTitleFromSelection } from "./utils";

export function useTrackReaderAnalytics({
  bookId,
  currentChapter,
  contentLoading,
  progress,
  analytics
}: {
  bookId?: string;
  currentChapter: number | null;
  contentLoading: boolean;
  progress: { currentChapter: number } | null | undefined;
  analytics: ReturnType<typeof useAnalytics>;
}) {
  const trackedChapterRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    if (!bookId || currentChapter === null || contentLoading) return;

    // Отслеживаем только смену главы, чтобы избежать повторных вызовов
    if (trackedChapterRef.current === currentChapter) return;
    
    trackedChapterRef.current = currentChapter;

    if (currentChapter === 1 || currentChapter === progress?.currentChapter) {
      analytics.trackBookOpen(bookId, getMobileAnalyticsContext({ source: "personal_reader" }) ?? undefined);
    }

    analytics.trackChapterStart(bookId, currentChapter);
    
    if (!sessionActiveRef.current) {
      analytics.startReadingSession(bookId, currentChapter);
      sessionActiveRef.current = true;
    }

    return () => {
      if (sessionActiveRef.current) {
        analytics.stopReadingSession();
        sessionActiveRef.current = false;
      }
    };
  }, [bookId, currentChapter, contentLoading, progress?.currentChapter]);
}

export function usePersistProgressOnUnmount({
  scrollContainerRef,
  bookData,
  currentChapter,
  contentLoading,
  clubId,
  bookId
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  bookData: ProcessedBookData;
  currentChapter: number | null;
  contentLoading: boolean;
  clubId?: string;
  bookId?: string;
}) {
  const contentLoadingRef = useRef(contentLoading);
  useEffect(() => { contentLoadingRef.current = contentLoading; }, [contentLoading]);

  useEffect(() => {
    return () => {
      const container = scrollContainerRef.current;
      if (!container || !bookData || bookData.totalChapters === 0 || currentChapter === null) return;
      // Не сохраняем если контент ещё не загружен — иначе totalChapters=1 (дефолт) даст progress=100
      if (contentLoadingRef.current) return;

      const payload = createReaderProgressPayload({
        currentChapter,
        totalChapters: bookData.totalChapters,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });

      if (!bookId) {
        return;
      }

      saveReaderProgressToStorage(
        {
          type: "personal",
          bookId,
        },
        payload,
      );

      const token = getAccessToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token && token !== "null") {
        headers.Authorization = `Bearer ${token}`;
      }

      fetch(`/api/v1/books/${bookId}/progress`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          ...payload,
          clubId,
        }),
        credentials: "include",
        keepalive: true,
      });
    };
  }, [scrollContainerRef, bookData, currentChapter, clubId, bookId]);
}

export function usePendingBookmarkNavigation({
  bookId,
  currentChapter,
  setPendingScrollRestore,
  setCurrentChapter,
}: {
  bookId?: string;
  currentChapter: number | null;
  setPendingScrollRestore: (restore: PendingScrollRestore | null) => void;
  setCurrentChapter: (chapter: number) => void;
}) {
  useEffect(() => {
    if (!bookId || currentChapter === null) {
      return;
    }

    const pendingBookmark = consumePendingReaderBookmarkNavigation(bookId);
    if (!pendingBookmark) {
      return;
    }

    const position = parseReaderPosition(pendingBookmark.position);
    if (!position?.chapter) {
      return;
    }

    setPendingScrollRestore({
      chapter: position.chapter,
      positionRaw: pendingBookmark.position,
    });
    setCurrentChapter(position.chapter);
  }, [bookId, currentChapter, setCurrentChapter, setPendingScrollRestore]);
}

export function usePendingScrollRestore({
  pendingScrollRestore,
  contentLoading,
  currentChapter,
  scrollElementRef,
  contentAreaRef,
  manualRestoreCleanupRef,
  setPendingScrollRestore,
}: {
  pendingScrollRestore: PendingScrollRestore | null;
  contentLoading: boolean;
  currentChapter: number | null;
  scrollElementRef: RefObject<HTMLElement | null>;
  contentAreaRef: RefObject<HTMLElement | null>;
  manualRestoreCleanupRef: RefObject<(() => void) | null>;
  setPendingScrollRestore: (restore: PendingScrollRestore | null) => void;
}) {
  useEffect(() => {
    return () => {
      manualRestoreCleanupRef.current?.();
    };
  }, [manualRestoreCleanupRef]);

  useEffect(() => {
    if (!pendingScrollRestore || contentLoading || currentChapter !== pendingScrollRestore.chapter) {
      return;
    }

    manualRestoreCleanupRef.current?.();
    manualRestoreCleanupRef.current = restoreReaderScrollPosition({
      scrollContainerRef: scrollElementRef,
      contentAreaRef,
      currentChapter,
      currentPositionRaw: pendingScrollRestore.positionRaw,
      delayMs: 120,
      retryAttempts: 5,
      retryDelayMs: 120,
    });
    setPendingScrollRestore(null);
  }, [
    contentLoading,
    currentChapter,
    manualRestoreCleanupRef,
    pendingScrollRestore,
    scrollElementRef,
    setPendingScrollRestore,
  ]);
}

export function useReaderChapterNavigation({
  currentChapter,
  chaptersLength,
  scrollContainerRef,
  saveProgressNow,
  setCurrentChapter,
}: {
  currentChapter: number | null;
  chaptersLength?: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  saveProgressNow: (options?: { chapter?: number; progressOverride?: number }) => void;
  setCurrentChapter: (chapter: number) => void;
}) {
  const persistCurrentChapterProgress = useCallback((chapterToSave: number) => {
    saveProgressNow({ chapter: chapterToSave });
  }, [saveProgressNow]);

  const changeChapter = useCallback((chapter: number) => {
    if (currentChapter === null) {
      setCurrentChapter(chapter);
      return;
    }

    if (chapter === currentChapter) {
      return;
    }

    persistCurrentChapterProgress(currentChapter);
    setCurrentChapter(chapter);

    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }, 100);
  }, [currentChapter, persistCurrentChapterProgress, scrollContainerRef, setCurrentChapter]);

  useKeyboardShortcuts([
    {
      key: readerShortcuts.prevChapter.key,
      action: () => {
        if (currentChapter !== null && currentChapter > 1) {
          changeChapter(currentChapter - 1);
        }
      },
      description: readerShortcuts.prevChapter.description,
      requireAtTop: true,
      scrollContainerRef,
    },
    {
      key: readerShortcuts.nextChapter.key,
      action: () => {
        if (currentChapter !== null && chaptersLength && currentChapter < chaptersLength) {
          changeChapter(currentChapter + 1);
        }
      },
      description: readerShortcuts.nextChapter.description,
      requireAtBottom: true,
      scrollContainerRef,
    },
  ]);

  return {
    changeChapter,
  };
}

export function useReaderSavedPositionActions({
  scrollContainerRef,
  currentChapter,
  totalChapters,
  selectionState,
  clearSelection,
  addBookmark,
  suggestedProgress,
  dismissSuggestion,
  setPendingScrollRestore,
  setCurrentChapter,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  currentChapter: number | null;
  totalChapters: number;
  selectionState: { text: string } | null;
  clearSelection: () => void;
  addBookmark: (data: { chapterNumber?: number; position: string; title?: string }, options?: { onSuccess?: () => void }) => void;
  suggestedProgress: { currentChapter: number; currentPosition: string } | null;
  dismissSuggestion: () => void;
  setPendingScrollRestore: (restore: PendingScrollRestore | null) => void;
  setCurrentChapter: (chapter: number) => void;
}) {
  const createCurrentBookmarkDraft = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || currentChapter === null) {
      return null;
    }

    const payload = createReaderProgressPayload({
      currentChapter,
      totalChapters,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    });

    return {
      chapterNumber: currentChapter,
      position: payload.currentPosition,
    };
  }, [currentChapter, scrollContainerRef, totalChapters]);

  const navigateToSavedPosition = useCallback((chapter: number, positionRaw: string) => {
    setPendingScrollRestore({
      chapter,
      positionRaw,
    });
    setCurrentChapter(chapter);
  }, [setCurrentChapter, setPendingScrollRestore]);

  const navigateToBookmark = useCallback((positionRaw: string) => {
    const position = parseReaderPosition(positionRaw);
    if (!position?.chapter) {
      return;
    }

    navigateToSavedPosition(position.chapter, positionRaw);
  }, [navigateToSavedPosition]);

  const addBookmarkFromSelection = useCallback(() => {
    if (!selectionState) {
      return;
    }

    const currentBookmarkDraft = createCurrentBookmarkDraft();
    if (!currentBookmarkDraft) {
      clearSelection();
      return;
    }

    const bookmarkTitle = createBookmarkTitleFromSelection(selectionState.text);

    addBookmark(
      {
        chapterNumber: currentBookmarkDraft.chapterNumber,
        position: currentBookmarkDraft.position,
        title: bookmarkTitle,
      },
      {
        onSuccess: () => {
          toast({
            title: "Закладка сохранена",
            description: "Выделенный фрагмент добавлен в закладки.",
          });
          clearSelection();
        },
      }
    );
  }, [addBookmark, clearSelection, createCurrentBookmarkDraft, selectionState]);

  const openLatestPosition = useCallback(() => {
    if (!suggestedProgress) {
      return;
    }

    dismissSuggestion();
    navigateToSavedPosition(suggestedProgress.currentChapter, suggestedProgress.currentPosition);
  }, [dismissSuggestion, navigateToSavedPosition, suggestedProgress]);

  return {
    createCurrentBookmarkDraft,
    navigateToBookmark,
    addBookmarkFromSelection,
    openLatestPosition,
  };
}
