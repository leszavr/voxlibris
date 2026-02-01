import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./use-auth";
import { useReadingSession } from "./use-reading-session";
import { useClub } from "./use-clubs";

export type SessionState = "prep" | "live" | "paused" | "summary";

export interface SessionStats {
  duration: number;
  avgListeners: number;
  peakListeners: number;
  chaptersRead: number;
  reactionsCount: number;
  positiveReactions: number;
  negativeReactions: number;
}

export function useStudioState(clubId: string, bookId: string, currentChapter: number) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { session, createSession, startReading, pauseReading, resumeReading, endReading } = useReadingSession();
  const { data: clubData } = useClub(clubId);

  // UI State
  const [fontSize, setFontSize] = useState([18]);
  const [lineHeight, setLineHeight] = useState([1.6]);
  const [contentWidth, setContentWidth] = useState([85]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [uploadMode, setUploadMode] = useState(false);
  const [contentText, setContentText] = useState("");
  const [showPrepModal, setShowPrepModal] = useState(true);
  const [micTestPassed, setMicTestPassed] = useState(false);
  const [showMicTest, setShowMicTest] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const [sessionStats, setSessionStats] = useState<SessionStats>({
    duration: 0,
    avgListeners: 0,
    peakListeners: 0,
    chaptersRead: 0,
    reactionsCount: 0,
    positiveReactions: 0,
    negativeReactions: 0
  });

  // Derive session state
  const getSessionState = (): SessionState => {
    if (showSummary) return "summary";
    if (!session.isLive) return "prep";
    if (session.isPaused) return "paused";
    return "live";
  };

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      if (!user || isInitialized || !clubId || !bookId) {
        console.log('[Studio] Skipping initialization:', { 
          hasUser: !!user, 
          isInitialized, 
          hasClubId: !!clubId, 
          hasBookId: !!bookId 
        });
        return;
      }

      console.log('[Studio] Initializing session...', { clubId, bookId, currentChapter });

      try {
        const sessionTitle = clubData
          ? `${clubData.book.title} - Глава ${currentChapter}`
          : `Глава ${currentChapter}`;

        const sessionId = await createSession({
          clubId,
          bookId,
          title: sessionTitle,
          description: 'Live чтение'
        });

        console.log('[Studio] ✅ Session initialized:', sessionId);
        setIsInitialized(true);
      } catch (error) {
        console.error('[Studio] ❌ Failed to initialize session:', error);
        setTimeout(() => {
          setIsInitialized(false);
        }, 3000);
      }
    };

    if (user && !isInitialized && clubId && bookId) {
      initializeSession();
    }
  }, [user, isInitialized, clubId, bookId, currentChapter, clubData, createSession]);

  // Session handlers
  const handleStartReading = () => {
    startReading();
    setShowPrepModal(false);
  };

  const handleEndReading = () => {
    // Calculate reaction statistics
    const positive = session.reactions.filter(r => 
      ['heart', 'thumbsUp', 'fire', 'star'].includes(r.type)
    ).length;
    const negative = session.reactions.length - positive;

    setSessionStats({
      duration: session.elapsedTime,
      avgListeners: Math.floor(session.listenerCount * 0.8),
      peakListeners: session.listenerCount,
      chaptersRead: 1,
      reactionsCount: session.reactions.length,
      positiveReactions: positive,
      negativeReactions: negative
    });

    endReading();
    setShowSummary(true);
  };

  // Navigation handlers
  const handleBackToClub = () => {
    setShowSummary(false);
    setLocation(`/clubs/${clubId}`);
  };

  const handlePrepareNext = () => {
    setShowSummary(false);
    setShowPrepModal(true);
    setMicTestPassed(false);
  };

  const handleDeleteContent = (onNavigate: (path: string) => void) => {
    if (currentChapter > 1) {
      onNavigate(`/studio/${clubId}/${bookId}/${currentChapter - 1}`);
    } else {
      onNavigate(`/clubs/${clubId}`);
    }
  };

  return {
    // State
    state: getSessionState(),
    session,
    sessionStats,
    fontSize,
    lineHeight,
    contentWidth,
    isInitialized,
    uploadMode,
    contentText,
    showPrepModal,
    micTestPassed,
    showMicTest,
    showSummary,
    clubData,

    // Setters
    setFontSize,
    setLineHeight,
    setContentWidth,
    setUploadMode,
    setContentText,
    setShowPrepModal,
    setMicTestPassed,
    setShowMicTest,
    setShowSummary,

    // Handlers
    handleStartReading,
    handleEndReading,
    handleBackToClub,
    handlePrepareNext,
    handleDeleteContent,
    pauseReading,
    resumeReading,
  };
}
