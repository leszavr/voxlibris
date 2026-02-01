import { useState, useCallback } from 'react';

export interface SystemCheckResult {
  browser: {
    compatible: boolean;
    name: string;
    version: string;
  };
  microphone: {
    available: boolean;
    devices: MediaDeviceInfo[];
  };
  network: {
    latency: number; // в мс
    quality: 'good' | 'fair' | 'poor';
  };
  storage: {
    available: boolean;
    estimatedSpace: number; // в MB
    maxRecordingMinutes: number;
  };
  recommendations: string[];
  overallStatus: 'ready' | 'warning' | 'not-ready';
}

export function useSystemCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<SystemCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Проверка браузера
  const checkBrowser = useCallback((): SystemCheckResult['browser'] => {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = 'Unknown';
    let compatible = false;

    if (ua.includes('Chrome')) {
      name = 'Chrome';
      const chromeRegex = /Chrome\/(\d+)/;
      const match = chromeRegex.exec(ua);
      version = match ? match[1] : 'Unknown';
      compatible = Number.parseInt(version, 10) >= 90;
    } else if (ua.includes('Firefox')) {
      name = 'Firefox';
      const firefoxRegex = /Firefox\/(\d+)/;
      const match = firefoxRegex.exec(ua);
      version = match ? match[1] : 'Unknown';
      compatible = Number.parseInt(version, 10) >= 88;
    } else if (ua.includes('Edg')) {
      name = 'Edge';
      const edgeRegex = /Edg\/(\d+)/;
      const match = edgeRegex.exec(ua);
      version = match ? match[1] : 'Unknown';
      compatible = Number.parseInt(version, 10) >= 90;
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      name = 'Safari';
      const safariRegex = /Version\/(\d+)/;
      const match = safariRegex.exec(ua);
      version = match ? match[1] : 'Unknown';
      compatible = Number.parseInt(version, 10) >= 14;
    }

    return { compatible, name, version };
  }, []);

  // Проверка микрофона
  const checkMicrophone = useCallback(async (): Promise<SystemCheckResult['microphone']> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      return {
        available: audioInputs.length > 0,
        devices: audioInputs
      };
    } catch (error) {
      console.warn('Failed to check microphone:', error);
      return {
        available: false,
        devices: []
      };
    }
  }, []);

  // Проверка сети (ping to server)
  const checkNetwork = useCallback(async (): Promise<SystemCheckResult['network']> => {
    try {
      const startTime = performance.now();
      
      // Делаем запрос к серверу для проверки задержки
      await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store'
      });
      
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      let quality: 'good' | 'fair' | 'poor';
      if (latency < 100) {
        quality = 'good';
      } else if (latency < 200) {
        quality = 'fair';
      } else {
        quality = 'poor';
      }

      return { latency, quality };
    } catch (error) {
      console.warn('Failed to check network:', error);
      return {
        latency: 999,
        quality: 'poor'
      };
    }
  }, []);

  // Проверка хранилища (Storage API)
  const checkStorage = useCallback(async (): Promise<SystemCheckResult['storage']> => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const availableBytes = (estimate.quota || 0) - (estimate.usage || 0);
        const availableMB = Math.floor(availableBytes / (1024 * 1024));
        
        // Примерно 5 МБ на минуту записи (опус с битрейтом 128kbps)
        const maxMinutes = Math.floor(availableMB / 5);

        return {
          available: availableMB > 100, // Минимум 100 МБ
          estimatedSpace: availableMB,
          maxRecordingMinutes: maxMinutes
        };
      }
      
      // Fallback если API не поддерживается
      return {
        available: true,
        estimatedSpace: 1000, // Предполагаем 1 ГБ
        maxRecordingMinutes: 200
      };
    } catch (error) {
      console.warn('Failed to check storage:', error);
      return {
        available: true,
        estimatedSpace: 1000,
        maxRecordingMinutes: 200
      };
    }
  }, []);

  // Анализ результатов браузера
  const analyzeBrowser = useCallback((browser: SystemCheckResult['browser']) => {
    const recommendations: string[] = [];
    let status: SystemCheckResult['overallStatus'] = 'ready';
    
    if (!browser.compatible) {
      recommendations.push(`Рекомендуем обновить ${browser.name} до последней версии`);
      status = 'not-ready';
    }
    
    return { recommendations, status };
  }, []);

  // Анализ результатов микрофона
  const analyzeMicrophone = useCallback((microphone: SystemCheckResult['microphone']) => {
    const recommendations: string[] = [];
    let status: SystemCheckResult['overallStatus'] = 'ready';
    
    if (!microphone.available) {
      recommendations.push('Микрофон не обнаружен. Подключите микрофон для чтения');
      status = 'not-ready';
    } else if (microphone.devices.length === 1) {
      recommendations.push('Обнаружен 1 микрофон. Убедитесь, что это правильное устройство');
    }
    
    return { recommendations, status };
  }, []);

  // Анализ результатов сети
  const analyzeNetwork = useCallback((network: SystemCheckResult['network']) => {
    const recommendations: string[] = [];
    let status: SystemCheckResult['overallStatus'] = 'ready';
    
    if (network.quality === 'poor') {
      recommendations.push('Слабое соединение с сервером. Проверьте интернет-соединение');
      status = 'warning';
    } else if (network.quality === 'fair') {
      recommendations.push('Соединение нормальное, но может быть нестабильным');
      status = 'warning';
    }
    
    return { recommendations, status };
  }, []);

  // Анализ результатов хранилища
  const analyzeStorage = useCallback((storage: SystemCheckResult['storage']) => {
    const recommendations: string[] = [];
    let status: SystemCheckResult['overallStatus'] = 'ready';
    
    if (!storage.available) {
      recommendations.push('Недостаточно места для локальной записи');
      status = 'warning';
    } else if (storage.maxRecordingMinutes < 60) {
      recommendations.push(`Доступно места для записи до ${storage.maxRecordingMinutes} минут`);
      status = 'warning';
    }
    
    return { recommendations, status };
  }, []);

  // Определение общего статуса
  const determineOverallStatus = useCallback((statuses: SystemCheckResult['overallStatus'][]) => {
    if (statuses.includes('not-ready')) return 'not-ready';
    if (statuses.includes('warning')) return 'warning';
    return 'ready';
  }, []);

  // Запуск полной проверки
  const runCheck = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      const [browser, microphone, network, storage] = await Promise.all([
        Promise.resolve(checkBrowser()),
        checkMicrophone(),
        checkNetwork(),
        checkStorage()
      ]);

      const browserAnalysis = analyzeBrowser(browser);
      const microphoneAnalysis = analyzeMicrophone(microphone);
      const networkAnalysis = analyzeNetwork(network);
      const storageAnalysis = analyzeStorage(storage);

      const allRecommendations = [
        ...browserAnalysis.recommendations,
        ...microphoneAnalysis.recommendations,
        ...networkAnalysis.recommendations,
        ...storageAnalysis.recommendations
      ];

      const recommendations = allRecommendations.length > 0 
        ? allRecommendations 
        : [
            'Ваш ПК полностью готов к проведению эфиров',
            'Рекомендуем закрыть фоновые приложения перед эфиром'
          ];

      const overallStatus = determineOverallStatus([
        browserAnalysis.status,
        microphoneAnalysis.status,
        networkAnalysis.status,
        storageAnalysis.status
      ]);

      const result: SystemCheckResult = {
        browser,
        microphone,
        network,
        storage,
        recommendations,
        overallStatus
      };

      setResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка проверки системы';
      setError(message);
    } finally {
      setIsChecking(false);
    }
  }, [checkBrowser, checkMicrophone, checkNetwork, checkStorage, analyzeBrowser, analyzeMicrophone, analyzeNetwork, analyzeStorage, determineOverallStatus]);

  return {
    isChecking,
    result,
    error,
    runCheck
  };
}
