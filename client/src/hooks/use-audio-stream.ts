import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseAudioStreamOptions {
  sessionId: string;
  enabled: boolean;
  onError?: (error: Error) => void;
}

export function useAudioStream({ sessionId, enabled, onError }: UseAudioStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const highpassFilterRef = useRef<BiquadFilterNode | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Инициализация аудио потока
  const startStreaming = useCallback(async () => {
    try {
      // Получаем доступ к микрофону с настройками из ТЗ
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      });

      mediaStreamRef.current = stream;

      // Создаем AudioContext для обработки
      const audioContext = new AudioContext({
        sampleRate: 48000
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      // 1. High-pass фильтр для удаления низкочастотного гула (< 80Hz)
      const highpassFilter = audioContext.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 80; // Убираем частоты ниже 80Hz
      highpassFilter.Q.value = 0.7;
      highpassFilterRef.current = highpassFilter;

      // 2. Dynamics Compressor для подавления шумов и выравнивания громкости
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -50; // Сигнал выше -50dB начинает сжиматься
      compressor.knee.value = 40; // Плавное сжатие
      compressor.ratio.value = 12; // Соотношение сжатия
      compressor.attack.value = 0.003; // Быстрая атака (3ms)
      compressor.release.value = 0.25; // Умеренный релиз (250ms)
      compressorRef.current = compressor;

      // 3. Analyser для визуализации уровня
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // 4. Gain node для управления громкостью
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;
      gainNodeRef.current = gainNode;

      // Соединяем узлы в цепочку обработки:
      // source → highpass → compressor → analyser → gain
      source.connect(highpassFilter);
      highpassFilter.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(gainNode);

      // Инициализируем WebSocket для передачи аудио
      const socket = io(globalThis.location.origin, {
        withCredentials: true,
        transports: ['websocket']
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Audio WebSocket connected');
        socket.emit('join_audio_session', { sessionId });
      });

      socket.on('disconnect', () => {
        console.log('Audio WebSocket disconnected');
      });

      // Начинаем мониторинг уровня аудио
      startAudioMonitoring();

      // Для MVP: отправляем аудио через WebSocket
      // В production будет использоваться mediasoup/WebRTC
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.connected && !isMuted) {
          socket.emit('audio_chunk', {
            sessionId,
            data: event.data
          });
        }
      };

      // Отправляем чанки каждые 100ms
      mediaRecorder.start(100);

      setIsStreaming(true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start audio stream');
      console.error('Audio stream error:', err);
      onError?.(err);
    }
  }, [sessionId, isMuted, onError]);

  // Остановка стриминга
  const stopStreaming = useCallback(() => {
    // Останавливаем мониторинг
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Закрываем медиа стрим
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Закрываем AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Закрываем WebSocket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsStreaming(false);
    setAudioLevel(0);
  }, []);

  // Мониторинг уровня аудио
  const startAudioMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (!analyser) return;

      analyser.getByteFrequencyData(dataArray);
      
      // Вычисляем средний уровень
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      const normalizedLevel = average / 255;
      
      setAudioLevel(normalizedLevel);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  // Управление mute
  const toggleMute = useCallback(() => {
    if (gainNodeRef.current) {
      const newMutedState = !isMuted;
      gainNodeRef.current.gain.value = newMutedState ? 0 : 1;
      setIsMuted(newMutedState);

      // Уведомляем сервер о mute
      if (socketRef.current?.connected) {
        socketRef.current.emit('audio_muted', {
          sessionId,
          muted: newMutedState
        });
      }
    }
  }, [isMuted, sessionId]);

  // Автоматический старт/стоп при изменении enabled
  useEffect(() => {
    if (enabled && !isStreaming) {
      startStreaming();
    } else if (!enabled && isStreaming) {
      stopStreaming();
    }
  }, [enabled, isStreaming, startStreaming, stopStreaming]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  return {
    isStreaming,
    isMuted,
    audioLevel,
    toggleMute,
    startStreaming,
    stopStreaming
  };
}
