import { useState, useRef, useCallback } from 'react';

export interface MicrophoneTestResult {
  quality: 'good' | 'fair' | 'poor';
  noiseLevel: number;
  volumeLevel: number;
  recommendations: string[];
}

export function useMicrophoneTest() {
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [testResult, setTestResult] = useState<MicrophoneTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const volumeSamplesRef = useRef<number[]>([]);

  // Запрос доступа к микрофону и начало записи
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Создаем AudioContext для анализа
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Запускаем запись
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        audioUrlRef.current = URL.createObjectURL(audioBlob);
        setHasRecording(true);
        
        // Анализируем качество записи на основе собранных данных
        analyzeRecording();
      };

      // Собираем данные во время записи
      const collectAudioData = () => {
        if (!analyserRef.current || mediaRecorderRef.current?.state !== 'recording') return;
        
        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        const max = Math.max(...dataArray);
        volumeSamplesRef.current.push(max);
        
        if (mediaRecorderRef.current?.state === 'recording') {
          requestAnimationFrame(collectAudioData);
        }
      };

      volumeSamplesRef.current = [];
      requestAnimationFrame(collectAudioData);

      mediaRecorder.start();
      setIsRecording(true);

      // Автоматически останавливаем через 5 секунд
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, 5000);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось получить доступ к микрофону';
      setError(message);
      console.error('Microphone access error:', err);
    }
  }, []);

  // Остановка записи
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    setIsRecording(false);
  }, []);

  // Анализ качества записи
  const analyzeRecording = useCallback(() => {
    if (volumeSamplesRef.current.length === 0) return;

    // Вычисляем средний и максимальный уровень громкости
    const avgVolume = volumeSamplesRef.current.reduce((sum, val) => sum + val, 0) / volumeSamplesRef.current.length;
    const maxVolume = Math.max(...volumeSamplesRef.current);
    
    // Нормализуем значения (0-255 -> 0-1)
    const volumeLevel = maxVolume / 255;
    const avgVolumeLevel = avgVolume / 255;
    
    // Оцениваем уровень шума (разница между средним и пиковым значением)
    const noiseLevel = Math.abs(volumeLevel - avgVolumeLevel);

    const recommendations: string[] = [];
    let quality: 'good' | 'fair' | 'poor' = 'good';

    // Пороги откалиброваны под реальные значения микрофонов
    if (volumeLevel < 0.05) {
      quality = 'poor';
      recommendations.push('Микрофон не улавливает звук. Проверьте настройки устройства');
    } else if (volumeLevel < 0.15) {
      quality = 'poor';
      recommendations.push('Говорите громче или приблизьтесь к микрофону');
    } else if (volumeLevel < 0.25) {
      quality = 'fair';
      recommendations.push('Уровень громкости можно немного увеличить');
    }

    if (noiseLevel > 0.4) {
      quality = quality === 'poor' ? 'poor' : 'fair';
      recommendations.push('Обнаружен высокий фоновый шум - закройте окна и уберите источники шума');
    } else if (noiseLevel > 0.25) {
      if (quality === 'good') quality = 'fair';
      recommendations.push('Присутствует фоновый шум');
    }

    if (volumeLevel > 0.95) {
      quality = 'fair';
      recommendations.push('Слишком громко - возможны искажения, отодвиньтесь от микрофона');
    }

    if (recommendations.length === 0) {
      recommendations.push('Качество звука отличное!');
    }

    setTestResult({
      quality,
      volumeLevel,
      noiseLevel,
      recommendations
    });
  }, []);

  // Воспроизведение записи
  const playRecording = useCallback(() => {
    if (!audioUrlRef.current || isPlaying) return;

    const audio = new Audio(audioUrlRef.current);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      setError('Ошибка воспроизведения записи');
      setIsPlaying(false);
    };
    
    audio.play();
    setIsPlaying(true);
  }, [isPlaying]);

  // Сброс теста
  const resetTest = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioChunksRef.current = [];
    volumeSamplesRef.current = [];
    setHasRecording(false);
    setTestResult(null);
    setError(null);
    setIsPlaying(false);
  }, []);

  return {
    isRecording,
    hasRecording,
    isPlaying,
    testResult,
    error,
    startRecording,
    stopRecording,
    playRecording,
    resetTest
  };
}
