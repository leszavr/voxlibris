import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './use-auth';
import { io, type Socket } from 'socket.io-client';

type ReactionType = 'heart' | 'thumbsUp' | 'fire' | 'star' | 'thumbsDown' | 'meh' | 'frown' | 'warning';

interface ReadingSessionState {
  sessionId?: string;
  isLive: boolean;
  isPaused: boolean;
  isConnected: boolean;
  listenerCount: number;
  currentChapter: number;
  currentPosition: string;
  elapsedTime: number;
  reactions: Array<{ type: ReactionType; userId: string; timestamp: number }>;
  connectionLostAt?: number;
}

interface CreateSessionParams {
  clubId: string;
  bookId: string;
  title: string;
  description?: string;
}

export function useReadingSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ReadingSessionState>({
    isLive: false,
    isPaused: false,
    isConnected: false,
    listenerCount: 0,
    currentChapter: 1,
    currentPosition: '0:0',
    elapsedTime: 0,
    reactions: []
  });
  
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Проверка таймаута соединения (60 сек согласно ТЗ)
  const startConnectionCheck = useCallback(() => {
    if (connectionCheckRef.current) return;
    
    connectionCheckRef.current = setTimeout(() => {
      if (!session.isConnected && session.isLive) {
        if (import.meta.env.DEV) {
          console.log('Connection timeout - ending session');
        }
      }
    }, 60000); // 60 секунд
  }, [session.isConnected, session.isLive]);

  const stopConnectionCheck = useCallback(() => {
    if (connectionCheckRef.current) {
      clearTimeout(connectionCheckRef.current);
      connectionCheckRef.current = null;
    }
  }, []);

  // Pause reading
  const pauseReading = () => {
    stopTimer();
    setSession(prev => ({ 
      ...prev, 
      isPaused: true 
    }));
  };

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user) {
      console.warn('[WebSocket] No user found, skipping connection');
      return;
    }

    console.log('[WebSocket] Initializing connection for user:', user.id);

    // 🔒 HttpOnly cookies автоматически отправляются через withCredentials
    const socket = io(globalThis.location.origin, {
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WebSocket] ✅ Connected successfully');
      setSession(prev => ({ ...prev, isConnected: true }));
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] ❌ Connection error:', error.message);
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] ⚠️ Disconnected');
      setSession(prev => ({ 
        ...prev, 
        isConnected: false,
        connectionLostAt: Date.now()
      }));
      
      // Автоматическая пауза при потере связи
      if (session.isLive && !session.isPaused) {
        pauseReading();
      }
      
      // Проверка таймаута 60 секунд согласно ТЗ
      startConnectionCheck();
    });

    socket.on('reconnect', () => {
      if (import.meta.env.DEV) {
        console.log('WebSocket reconnected');
      }
      setSession(prev => ({ 
        ...prev, 
        isConnected: true,
        connectionLostAt: undefined
      }));
      stopConnectionCheck();
    });

    socket.on('session_joined', (data: any) => {
      if (import.meta.env.DEV) {
        console.log('Successfully joined session:', data);
      }
      setSession(prev => ({
        ...prev,
        listenerCount: data.listenerCount,
        currentChapter: data.currentChapter,
        currentPosition: data.currentPosition
      }));
    });

    socket.on('session_started', () => {
      setSession(prev => ({ ...prev, isLive: true, isPaused: false }));
    });

    socket.on('listener_update', () => {
      fetchListenerCount();
    });

    // Обработка реакций от слушателей
    socket.on('reaction_received', (data: { type: ReactionType; userId: string; timestamp: number }) => {
      setSession(prev => ({
        ...prev,
        reactions: [...prev.reactions, data].slice(-50)
      }));
    });

    socket.on('session_ended', () => {
      setSession(prev => ({ ...prev, isLive: false }));
      stopTimer();
    });

    socket.on('error', (error) => {
      if (import.meta.env.DEV) {
        console.error('WebSocket error:', error);
      }
    });

    return () => {
      socket.disconnect();
      stopConnectionCheck();
    };
  }, [user, stopConnectionCheck]);

  // Timer for elapsed time
  const startTimer = () => {
    if (timerRef.current) return;
    
    timerRef.current = setInterval(() => {
      setSession(prev => ({ ...prev, elapsedTime: prev.elapsedTime + 1 }));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Create new reading session
  const createSession = async (params: CreateSessionParams): Promise<string> => {
    console.log('[Session] Creating session with params:', params);
    
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 🔒 HttpOnly cookies
        body: JSON.stringify(params),
      });

      console.log('[Session] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[Session] ❌ Failed to create session:', response.status, errorData);
        throw new Error(errorData.message || 'Failed to create reading session');
      }

      const data = await response.json();
      const sessionId = data.session.id;
      
      console.log('[Session] ✅ Session created:', sessionId);
      
      setSession(prev => ({
        ...prev,
        sessionId,
        currentChapter: 1,
        currentPosition: '0:0',
        elapsedTime: 0
      }));
      
      if (socketRef.current?.connected) {
        console.log('[Session] Joining WebSocket session:', sessionId);
        socketRef.current.emit('join_session', sessionId);
      } else {
        console.warn('[Session] ⚠️ Socket not connected, cannot join session');
      }
      
      return sessionId;
    } catch (error) {
      console.error('[Session] ❌ Error creating session:', error);
      throw error;
    }
  };

  // Start live reading
  const startReading = () => {
    if (!session.sessionId || !socketRef.current) {
      if (import.meta.env.DEV) {
        console.error('Cannot start reading: missing sessionId or socket connection');
      }
      return;
    }
    
    if (!session.isConnected) {
      if (import.meta.env.DEV) {
        console.error('Cannot start reading: WebSocket not connected');
      }
      return;
    }
    
    if (import.meta.env.DEV) {
      console.log('Starting reading session:', session.sessionId);
    }
    socketRef.current.emit('start_reading', session.sessionId);
    startTimer();
    
    setSession(prev => ({
      ...prev,
      isLive: true,
      isPaused: false
    }));
  };

  // Resume reading
  const resumeReading = () => {
    startTimer();
    setSession(prev => ({ 
      ...prev, 
      isPaused: false 
    }));
  };

  // End reading session
  const endReading = () => {
    if (!session.sessionId || !socketRef.current) return;
    
    socketRef.current.emit('end_reading', session.sessionId);
    stopTimer();
    
    setSession(prev => ({ 
      ...prev, 
      isLive: false,
      isPaused: false
    }));
  };

  // Update reading position
  const updatePosition = (chapter: number, position: string) => {
    if (!session.sessionId || !socketRef.current) return;
    
    socketRef.current.emit('update_position', {
      sessionId: session.sessionId,
      currentChapter: chapter,
      currentPosition: position,
      timestamp: new Date().toISOString()
    });
    
    setSession(prev => ({ 
      ...prev, 
      currentChapter: chapter,
      currentPosition: position
    }));
  };

  // Fetch current listener count
  const fetchListenerCount = async () => {
    if (!session.sessionId) return;
    
    try {
      const response = await fetch(`/api/sessions/${session.sessionId}/listeners`, {
        credentials: 'include' // 🔒 HttpOnly cookies
      });
      
      if (response.ok) {
        const data = await response.json();
        setSession(prev => ({ 
          ...prev, 
          listenerCount: data.count 
        }));
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching listener count:', error);
      }
    }
  };

  // Отправка реакции (для слушателей)
  const sendReaction = (type: string) => {
    if (!session.sessionId || !socketRef.current) return;
    
    socketRef.current.emit('send_reaction', {
      sessionId: session.sessionId,
      type,
      timestamp: Date.now()
    });
  };

  return {
    session,
    createSession,
    startReading,
    pauseReading,
    resumeReading,
    endReading,
    updatePosition,
    fetchListenerCount,
    sendReaction
  };
}
