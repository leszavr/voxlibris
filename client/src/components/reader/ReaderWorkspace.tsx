import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useBookContent, useReadingProgress, useUpdateProgress } from "../../hooks/use-reader";
import { useAnalytics } from "../../hooks/use-analytics";
import { ContentRenderer } from "./ContentRenderer";
import { ReaderControls } from "./ReaderControls";
import { CompactSyncIndicator } from "./SyncIndicator";
import { Button } from "../ui/button";
import { Maximize2, Minimize2, List, Settings, ArrowLeft } from "lucide-react";

interface Chapter {
  chapterNumber: number;
  title?: string;
  content?: string;
}

interface BookData {
  id?: string;
  title: string;
  chapters?: Chapter[];
  content?: string;
  isPersonalBook?: boolean;
}

interface ReaderWorkspaceProps {
  bookId?: string;
  clubId?: string;
  params?: {
    bookId?: string;
  };
}

function applyReaderSettings() {
  const saved = localStorage.getItem("readerSettings");
  if (!saved) return;

  try {
    const settings = JSON.parse(saved);
    const root = document.documentElement;
    root.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--reader-font-family", settings.fontFamily);
    root.style.setProperty("--reader-line-height", settings.lineHeight.toString());
    root.style.setProperty("--reader-text-align", settings.textAlign);
    root.style.setProperty("--reader-content-width", `${settings.contentWidth}%`);
    (root.dataset as any).readerTheme = settings.theme;
    document.body.classList.remove("reader-light", "reader-dark", "reader-sepia");
    document.body.classList.add(`reader-${settings.theme}`);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('Ошибка применения настроек:', e);
    }
  }
}

function initializeReaderChapter(
  progress: { currentChapter: number } | null | undefined,
  currentChapter: number | null,
  setCurrentChapter: (chapter: number) => void
) {
  if (currentChapter !== null) return;
  
  const initialChapter = progress?.currentChapter || 1;
  setCurrentChapter(initialChapter);
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function ReaderWorkspace({ bookId: propBookId, clubId, params }: Readonly<ReaderWorkspaceProps>) {
  const routeParams = useParams();
  const bookId = propBookId || params?.bookId || routeParams.bookId;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<number | null>(null); // null пока не загрузится progress
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressRestored, setProgressRestored] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedProgressRef = useRef<{chapter: number, position: string, progress: number} | null>(null);

  // Загрузка прогресса (пока используем тот же API для всех книг)
  const { data: progress, isLoading: progressLoading } = useReadingProgress(bookId!);
  
  // Загрузка контента (только после получения прогресса)
  const { data: content, isLoading: contentLoading } = useBookContent(
    bookId!,
    currentChapter || 1,
    currentChapter !== null // загружаем контент только после определения главы
  );
  const { mutate: updateProgress } = useUpdateProgress(bookId!);
  
  // Analytics hooks
  const analytics = useAnalytics();
  
  // Инициализация currentChapter из прогресса при первой загрузке
  useEffect(() => {
    if (!progressLoading) {
      initializeReaderChapter(progress, currentChapter, setCurrentChapter);
    }
  }, [progress, progressLoading, currentChapter]);

  // Адаптация данных в зависимости от источника (personalBooks или books)
  const bookData = content && 'book' in content 
    ? {
        title: content.book.title,
        chapters: content.book.chapters,
        totalChapters: content.book.chapters?.length || 1,
        isPersonalBook: true
      }
    : {
        title: (content as any)?.title || "Загрузка...",
        content: (content as any)?.content || "",
        totalChapters: 1,
        isPersonalBook: false
      };

  // Получаем текущую главу в зависимости от типа книги
  const currentChapterContent = bookData.isPersonalBook && bookData.chapters
    ? bookData.chapters.find(ch => ch.chapterNumber === currentChapter)?.content || ""
    : bookData.content || "";

  // Применение сохранённых настроек ридера при загрузке
  useEffect(() => {
    applyReaderSettings();
  }, []);

  // Трекинг открытия книги и начала чтения главы
  useEffect(() => {
    if (!bookId || currentChapter === null || contentLoading) return;

    // Отслеживаем открытие книги только один раз
    const isFirstChapter = currentChapter === 1 || currentChapter === progress?.currentChapter;
    if (isFirstChapter) {
      analytics.trackBookOpen(bookId);
    }
    
    // Отслеживаем начало чтения главы
    analytics.trackChapterStart(bookId, currentChapter);
    
    // Запускаем отслеживание сессии чтения
    analytics.startReadingSession(bookId, currentChapter);
    
    return () => {
      analytics.stopReadingSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, currentChapter, contentLoading]);

  // Восстановление позиции из прогресса (только один раз при загрузке)
  useEffect(() => {
    const shouldRestore = progress && 
      !contentLoading && 
      !progressRestored && 
      currentChapter === progress.currentChapter &&
      currentChapter !== null;

    if (!shouldRestore) return;

    if (import.meta.env.DEV) {
      console.log('[Reader] Restoring scroll position from progress:', progress);
    }
    
    if (progress.currentPosition && scrollContainerRef.current) {
      try {
        const position = JSON.parse(progress.currentPosition);
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = position.scrollTop || 0;
            if (import.meta.env.DEV) {
              console.log('[Reader] Restored scroll position:', position.scrollTop);
            }
          }
        }, 300);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('Ошибка восстановления позиции скролла:', e);
        }
      }
    }
    setProgressRestored(true);
  }, [progress, contentLoading, progressRestored, currentChapter]);

  // Колбэки для сохранения прогресса (вынесены для уменьшения вложенности)
  const handleProgressSuccess = useCallback(() => {
    setIsSyncing(false);
    setLastSyncTime(Date.now());
  }, []);

  const handleProgressError = useCallback((error: Error) => {
    setIsSyncing(false);
    setSyncError(error instanceof Error ? error.message : "Ошибка сохранения прогресса");
    setTimeout(() => setSyncError(null), 3000);
  }, []);

  // Отслеживание скролла и сохранение прогресса
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !bookData || bookData.totalChapters === 0 || currentChapter === null) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // Вычисление прогресса скролла в текущей главе
      const scrollProgress = Math.min(
        100,
        Math.round((scrollTop / Math.max(1, scrollHeight - clientHeight)) * 100)
      );

      // Общий прогресс по всей книге
      const totalProgress = Math.round(
        ((currentChapter - 1) / bookData.totalChapters + scrollProgress / 100 / bookData.totalChapters) * 100
      );

      // Debounce - сохраняем только через 1.5 секунды после остановки скролла
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const position = JSON.stringify({ scrollTop, scrollHeight, clientHeight });
        if (import.meta.env.DEV) {
          console.log('[Reader] Saving progress:', { currentChapter, totalProgress, position });
        }
        
        // Устанавливаем состояние синхронизации
        setIsSyncing(true);
        setSyncError(null);
        
        // Сохраняем последний прогресс в ref
        lastSavedProgressRef.current = {
          chapter: currentChapter,
          position,
          progress: totalProgress
        };
        
        updateProgress({
          currentChapter,
          currentPosition: position,
          progress: totalProgress,
          clubId,
        }, {
          onSuccess: handleProgressSuccess,
          onError: handleProgressError
        });
      }, 1500);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentChapter, bookData, updateProgress, clubId, handleProgressSuccess, handleProgressError]);

  // Сохранение прогресса при выходе из компонента
  const saveProgressOnUnmount = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !bookData || bookData.totalChapters === 0 || !currentChapter) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    const scrollProgress = Math.min(
      100,
      Math.round((scrollTop / Math.max(1, scrollHeight - clientHeight)) * 100)
    );
    
    const totalProgress = Math.round(
      ((currentChapter - 1) / bookData.totalChapters + scrollProgress / 100 / bookData.totalChapters) * 100
    );
    
    const position = JSON.stringify({ scrollTop, scrollHeight, clientHeight });
    
    if (import.meta.env.DEV) {
      console.log('[Reader] Saving progress on unmount:', { currentChapter, totalProgress });
    }
    
    const token = localStorage.getItem('authToken');
    if (token && bookId) {
      fetch('/api/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookId,
          currentChapter,
          currentPosition: position,
          progress: totalProgress,
          clubId,
        }),
        keepalive: true,
      });
    }
  }, [bookId, currentChapter, bookData, clubId]);

  // Сохранение прогресса при выходе из компонента (размонтировании)
  useEffect(() => {
    return saveProgressOnUnmount;
  }, [saveProgressOnUnmount]);

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

  // Рендер навигации по главам
  const renderChapterNavigation = () => {
    const chapter = currentChapter ?? 1;
    return (
      <div className="flex justify-between items-center mt-12 pt-8 border-t">
        <Button
          variant="outline"
          onClick={() => setCurrentChapter(Math.max(1, chapter - 1))}
          disabled={chapter <= 1}
        >
          ← Предыдущая глава
        </Button>
        <span className="text-sm text-muted-foreground">
          Глава {chapter} из {bookData.totalChapters}
        </span>
        <Button
          variant="outline"
          onClick={() => setCurrentChapter(Math.min(bookData.totalChapters, chapter + 1))}
          disabled={chapter >= bookData.totalChapters}
        >
          Следующая глава →
        </Button>
      </div>
    );
  };

  // Рендер контента без вложенных тернариев
  const renderMainContent = () => {
    if (contentLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      );
    }
    if (currentChapterContent) {
      return (
        <>
          <ContentRenderer content={currentChapterContent} />
          {renderChapterNavigation()}
        </>
      );
    }
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Контент не найден</p>
      </div>
    );
  };

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground">Книга не найдена</p>
      </div>
    );
  }

  if (currentChapter === null || progressLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="border-b bg-background relative z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            {/* Возврат в библиотеку */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (globalThis.location.href = '/library')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Библиотека
            </Button>

            {/* Оглавление */}
            <div className="relative">
              <Button
                variant={tocOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setTocOpen(!tocOpen);
                  setSettingsOpen(false);
                }}
              >
                <List className="w-4 h-4 mr-2" />
                Оглавление
              </Button>
              {tocOpen && (
                <div className="absolute left-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-background text-foreground border rounded-md shadow-lg p-4 z-50">
                  <h3 className="font-semibold text-lg mb-4">Оглавление</h3>
                  <div className="space-y-2">
                    {bookData.isPersonalBook && bookData.chapters ? (
                      bookData.chapters.map((chapter: Chapter) => (
                        <Button
                          key={chapter.chapterNumber}
                          variant={currentChapter === chapter.chapterNumber ? "secondary" : "ghost"}
                          className="w-full justify-start"
                          onClick={() => {
                            setCurrentChapter(chapter.chapterNumber);
                            setTocOpen(false);
                          }}
                        >
                          {chapter.title || `Глава ${chapter.chapterNumber}`}
                        </Button>
                      ))
                    ) : (
                      <Button
                        variant={currentChapter === 1 ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => {
                          setCurrentChapter(1);
                          setTocOpen(false);
                        }}
                      >
                        Глава 1
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Правая часть - информация о книге и действия */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <h1 className="text-lg font-semibold">
                {bookData.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {bookData.isPersonalBook && bookData.chapters 
                  ? bookData.chapters.find((ch: Chapter) => ch.chapterNumber === currentChapter)?.title || `Глава ${currentChapter}`
                  : `Глава ${currentChapter}`}
              </p>
            </div>

            {/* Настройки */}
            <div className="relative">
              <Button
                variant={settingsOpen ? "secondary" : "ghost"}
                size="icon"
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                  setTocOpen(false);
                }}
                title="Настройки чтения"
              >
                <Settings className="w-5 h-5" />
              </Button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-background text-foreground border rounded-md shadow-lg p-4 z-50">
                  <ReaderControls bookId={bookId} />
                </div>
              )}
            </div>

            {/* Полноэкранный режим */}
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

      {/* Main Content Area */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-background text-foreground">
        <div 
          className="mx-auto px-8 py-12"
          style={{
            width: "var(--reader-content-width, 80%)"
          }}
        >
          {renderMainContent()}
        </div>
      </main>

      {/* Компактный индикатор синхронизации */}
      <CompactSyncIndicator
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime || undefined}
        error={syncError || undefined}
      />
    </div>
  );
}
