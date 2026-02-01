import React from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCreateBookContent, useDeleteBookContent } from "@/hooks/use-books";
import { useClubBookContent, useClubReadingProgress, useUpdateClubProgress } from "@/hooks/use-club-reader";
import { useAudioStream } from "@/hooks/use-audio-stream";
import { SessionSummary } from "@/components/studio/SessionSummary";
import { useStudioState } from "@/hooks/use-studio-state";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { SettingsPanel } from "@/components/studio/SettingsPanel";
import { ContentRenderer } from "@/components/studio/ContentRenderer";
import { PreparationModal } from "@/components/studio/PreparationModal";
import { FloatingControls } from "@/components/studio/FloatingControls";
import { InteractionPanel } from "@/components/studio/InteractionPanel";

export default function ReaderStudio() {
  const [, params] = useRoute("/studio/:clubId/:bookId/:chapter?");
  const [, setLocation] = useLocation();

  // Extract route params
  const clubId = params?.clubId || "";
  const bookId = params?.bookId || "";
  const urlChapter = params?.chapter ? Number.parseInt(params.chapter, 10) : null;
  
  // Загрузка прогресса чтения
  const { data: progress, isLoading: progressLoading } = useClubReadingProgress(clubId, bookId);
  const { mutate: updateProgress } = useUpdateClubProgress(clubId);
  
  // Определяем текущую главу: из URL или из прогресса
  const currentChapter = urlChapter || progress?.userProgress?.currentChapter || 1;

  // Ref для контейнера скролла
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [shouldRestoreScroll, setShouldRestoreScroll] = React.useState(false);

  // Studio state management
  const studioState = useStudioState(clubId, bookId, currentChapter);
  const {
    state,
    session,
    sessionStats,
    fontSize,
    lineHeight,
    contentWidth,
    uploadMode,
    contentText,
    showPrepModal,
    micTestPassed,
    showMicTest,
    setFontSize,
    setLineHeight,
    setContentWidth,
    setUploadMode,
    setContentText,
    setShowPrepModal,
    setMicTestPassed,
    setShowMicTest,
    handleStartReading,
    handleEndReading,
    handleBackToClub,
    handlePrepareNext,
    handleDeleteContent,
    pauseReading,
    resumeReading,
  } = studioState;

  // Data fetching - используем тот же API что и для обычного чтения
  const { data: content, isLoading: contentLoading, error: contentError } = useClubBookContent(
    clubId,
    bookId,
    currentChapter,
    true
  );
  const createContentMutation = useCreateBookContent();
  const deleteContentMutation = useDeleteBookContent();

  // WebRTC аудио стриминг
  const { isStreaming, isMuted, audioLevel, toggleMute } = useAudioStream({
    sessionId: session.sessionId || '',
    enabled: session.isLive && !session.isPaused,
    onError: (error) => {
      console.error('Audio stream error:', error);
    }
  });

  // Реалистичная визуализация уровня аудио
  const micLevel = isStreaming && !isMuted ? audioLevel * 100 : 0;

  // Восстановление прогресса: перенаправляем на сохраненную главу
  React.useEffect(() => {
    if (!progressLoading && progress && !urlChapter) {
      const savedChapter = progress.userProgress?.currentChapter || 1;
      if (savedChapter !== 1) {
        setShouldRestoreScroll(true);
        setLocation(`/studio/${clubId}/${bookId}/${savedChapter}`, { replace: true });
      }
    }
  }, [progress, progressLoading, urlChapter, clubId, bookId, setLocation]);

  // Восстановление позиции скролла после загрузки контента
  React.useEffect(() => {
    if (shouldRestoreScroll && !contentLoading && content && progress?.userProgress?.currentPosition) {
      try {
        const position = JSON.parse(progress.userProgress.currentPosition);
        if (position.chapter === currentChapter && position.scrollTop) {
          setTimeout(() => {
            const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
            if (viewport) {
              viewport.scrollTop = position.scrollTop;
              console.log('[Studio] Restored scroll position:', position.scrollTop);
            }
          }, 300);
        }
      } catch (error) {
        console.error('[Studio] Failed to restore scroll position:', error);
      }
      setShouldRestoreScroll(false);
    }
  }, [shouldRestoreScroll, contentLoading, content, progress, currentChapter]);

  // Автосохранение позиции при скролле (каждые 5 секунд)
  React.useEffect(() => {
    const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (!viewport) return;

    let saveTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const scrollTop = viewport.scrollTop;
        const scrollHeight = viewport.scrollHeight - viewport.clientHeight;
        const scrollPercent = scrollHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100)) : 0;
        
        const position = JSON.stringify({
          chapter: currentChapter,
          scrollTop,
          timestamp: Date.now()
        });
        
        const totalChapters = content?.totalChapters || 1;
        const progressPercent = Math.round(((currentChapter - 1) / totalChapters + scrollPercent / 100 / totalChapters) * 100);

        updateProgress({
          currentChapter,
          currentPosition: position,
          progress: progressPercent
        });
      }, 5000);
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      clearTimeout(saveTimeout);
    };
  }, [currentChapter, content?.totalChapters, updateProgress]);

  // Content management handlers
  const handleUploadContent = async () => {
    if (!contentText.trim() || !bookId) return;

    try {
      await createContentMutation.mutateAsync({
        bookId,
        data: {
          chapterNumber: currentChapter,
          title: `Глава ${currentChapter}`,
          content: contentText,
        }
      });
      setContentText("");
      setUploadMode(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Не удалось загрузить контент:", error);
      }
    }
  };

  const handleDeleteContentClick = async () => {
    if (!content?.chapter || !bookId) return;

    try {
      await deleteContentMutation.mutateAsync({
        bookId,
        chapterNumber: currentChapter
      });
      handleDeleteContent(setLocation);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Не удалось удалить контент:", error);
      }
    }
  };

  // Show session summary
  if (state === "summary") {
    return (
      <SessionSummary
        sessionData={sessionStats}
        onBackToClub={handleBackToClub}
        onPrepareNext={handlePrepareNext}
      />
    );
  }

  // Error state - no content
  if (contentError && !uploadMode) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] text-stone-200 font-sans flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">Ошибка загрузки контента</h2>
          <p className="text-stone-400">{contentError?.message || 'Не удалось загрузить содержимое книги'}</p>
          <Button 
            variant="outline" 
            onClick={() => setLocation(`/clubs/${clubId}`)}
          >
            Вернуться в клуб
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#1a1a1a] text-stone-200 font-sans flex flex-col overflow-hidden">
      {/* Studio Header */}
      <StudioHeader
        state={state}
        listenerCount={session.listenerCount}
        elapsedTime={session.elapsedTime}
        bookTitle={content?.title}
        currentChapter={currentChapter}
        clubId={clubId}
        onBackToClub={() => setLocation(`/clubs/${clubId}`)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Settings */}
        <SettingsPanel
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          lineHeight={lineHeight}
          onLineHeightChange={setLineHeight}
          contentWidth={contentWidth}
          onContentWidthChange={setContentWidth}
          micLevel={micLevel}
          isMuted={isMuted}
          isStreaming={isStreaming}
        />

        {/* Center Panel: Reader View */}
        <div className="flex-1 relative overflow-hidden">
          {/* Preparation Modal */}
          <PreparationModal
            showPrepModal={state === "prep" && showPrepModal && !showMicTest}
            showMicTest={showMicTest}
            micTestPassed={micTestPassed}
            session={session}
            isInitialized={studioState.isInitialized}
            onClosePrepModal={() => setShowPrepModal(false)}
            onShowMicTest={() => setShowMicTest(true)}
            onCloseMicTest={() => setShowMicTest(false)}
            onMicTestComplete={(passed) => setMicTestPassed(passed)}
            onStartReading={handleStartReading}
          />

          <ScrollArea ref={scrollContainerRef} className="absolute inset-0 h-full w-full">
            <div className="p-8 md:p-16">
              <ContentRenderer
              uploadMode={uploadMode}
              contentText={contentText}
              currentChapter={currentChapter}
              fontSize={fontSize}
              lineHeight={lineHeight}
              contentWidth={contentWidth}
              chapterLoading={contentLoading}
              chapterData={content}
              chapterError={contentError}
              createContentMutation={createContentMutation}
              deleteContentMutation={deleteContentMutation}
              totalChapters={content?.totalChapters || 0}
              onContentTextChange={setContentText}
              onUploadContent={handleUploadContent}
              onDeleteContent={handleDeleteContentClick}
              onToggleUploadMode={setUploadMode}
              onChapterChange={(chapter) => {
                // Сохраняем текущую позицию перед переходом
                const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
                if (viewport) {
                  const scrollTop = viewport.scrollTop;
                  const scrollHeight = viewport.scrollHeight - viewport.clientHeight;
                  const scrollPercent = scrollHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100)) : 0;
                  
                  const position = JSON.stringify({
                    chapter: currentChapter,
                    scrollTop,
                    timestamp: Date.now()
                  });
                  
                  const totalChapters = content?.totalChapters || 1;
                  const progressPercent = Math.round(((currentChapter - 1) / totalChapters + scrollPercent / 100 / totalChapters) * 100);

                  updateProgress({
                    currentChapter,
                    currentPosition: position,
                    progress: progressPercent
                  });
                }
                
                setLocation(`/studio/${clubId}/${bookId}/${chapter}`);
              }}
            />
            {/* Bottom padding for scroll */}
            <div className="h-32" />
            </div>
          </ScrollArea>

          {/* Floating Controls */}
          <FloatingControls
            state={state}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onPauseReading={pauseReading}
            onResumeReading={resumeReading}
            onEndReading={handleEndReading}
          />
        </div>

        {/* Right Panel: Interactions */}
        <InteractionPanel session={session} />
      </main>
    </div>
  );
}
