import { User } from '../../../shared/schema';
import { AuthError, AuthErrorFactory, AuthErrorHandler } from './auth-errors';

interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  rememberMe?: boolean;
  invitedBy?: string;
  invitedToClub?: string;
  invite?: string; // invite token
}

interface AuthResponse {
  user: User;
  sessionType?: string;
}

interface RefreshResponse {
  message: string;
  sessionType: string;
}

/**
 * ✅ SECURE AUTH API - HttpOnly Cookies Only
 * Токены хранятся только в HttpOnly cookies на сервере
 * JavaScript не имеет доступа к токенам (защита от XSS)
 */
class AuthAPI {
  private readonly baseURL = '/api';
  private refreshTimer: NodeJS.Timeout | null = null;
  private activityTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private isRefreshing: boolean = false;
  private isAuthenticated: boolean = false;

  constructor() {
    this.startActivityTracking();
  }

  /**
   * ✅ Создать заголовки для fetch
   * Токены автоматически отправляются через cookies
   */
  private createHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * ✅ Выполнить authenticated fetch запрос
   * credentials: 'include' автоматически отправляет cookies
   */
  private async authenticatedFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // 🔒 CRITICAL: включает отправку HttpOnly cookies
      headers: {
        ...this.createHeaders(),
        ...options.headers,
      },
    });

    // Если 401 - пробуем обновить токен
    if (response.status === 401 && !url.includes('/auth/refresh')) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Повторяем запрос с новым токеном
        return fetch(url, {
          ...options,
          credentials: 'include',
          headers: {
            ...this.createHeaders(),
            ...options.headers,
          },
        });
      }
    }

    return response;
  }

  /**
   * ✅ Обновить access token через refresh token (HttpOnly cookie)
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (this.isRefreshing) {
      // Ждем завершения текущего обновления
      return new Promise((resolve) => {
        const checkRefresh = () => {
          if (this.isRefreshing) {
            setTimeout(checkRefresh, 100);
          } else {
            resolve(this.isAuthenticated);
          }
        };
        checkRefresh();
      });
    }

    this.isRefreshing = true;
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // 🔒 Отправляет HttpOnly refreshToken cookie
      });

      if (!response.ok) {
        this.isAuthenticated = false;
        return false;
      }

      const data: RefreshResponse = await response.json();
      this.isAuthenticated = true;
      
      // Перезапускаем таймер автоматического обновления
      this.startTokenRefreshTimer();
      
      return true;
    } catch (error) {
      console.error('[AuthAPI] Refresh failed:', error);
      this.isAuthenticated = false;
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * ✅ Запуск автоматического обновления токенов
   * Обновляем каждые 10 минут для short-lived tokens (15m)
   */
  private startTokenRefreshTimer(): void {
    this.clearTokenRefreshTimer();
    
    // Обновляем токен каждые 10 минут
    const refreshTime = 10 * 60 * 1000;
    
    this.refreshTimer = setTimeout(async () => {
      try {
        // Проверяем активность пользователя
        const inactiveTime = Date.now() - this.lastActivity;
        const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 минут
        
        if (inactiveTime < INACTIVE_THRESHOLD) {
          await this.refreshAccessToken();
        } else {
          // Пользователь неактивен - не обновляем автоматически
          this.clearTokenRefreshTimer();
        }
      } catch (error) {
        console.error('[AuthAPI] Auto refresh failed:', error);
        this.handleAuthError();
      }
    }, refreshTime);
  }

  /**
   * ✅ Очистить таймер обновления
   */
  private clearTokenRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * ✅ Отслеживание активности пользователя
   */
  private startActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      
      // Возобновляем обновление токенов, если пользователь снова активен
      if (!this.refreshTimer && this.isAuthenticated) {
        this.startTokenRefreshTimer();
      }
    };
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
  }

  /**
   * ✅ Обработка ошибок аутентификации
   */
  private handleAuthError(): void {
    this.clearTokenRefreshTimer();
    this.isAuthenticated = false;
    // Генерируем событие для обновления UI
    window.dispatchEvent(new Event('auth-error'));
  }

  /**
   * ✅ Логин пользователя
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        credentials: 'include', // 🔒 Получает HttpOnly cookies
        headers: this.createHeaders(),
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'login');
        throw error;
      }

      const data: AuthResponse = await response.json();
      this.isAuthenticated = true;
      this.startTokenRefreshTimer();
      
      return data;
    } catch (error) {
      this.isAuthenticated = false;
      if (error instanceof AuthError) {
        throw error;
      }
      
      const authError = AuthErrorFactory.networkError();
      AuthErrorHandler.logError(authError, 'login');
      throw authError;
    }
  }

  /**
   * ✅ Регистрация пользователя
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/auth/register`, {
        method: 'POST',
        credentials: 'include', // 🔒 Получает HttpOnly cookies
        headers: this.createHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'register');
        throw error;
      }

      const result: AuthResponse = await response.json();
      this.isAuthenticated = true;
      this.startTokenRefreshTimer();
      
      return result;
    } catch (error) {
      this.isAuthenticated = false;
      if (error instanceof AuthError) {
        throw error;
      }
      
      const authError = AuthErrorFactory.networkError();
      AuthErrorHandler.logError(authError, 'register');
      throw authError;
    }
  }

  /**
   * ✅ Logout пользователя
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseURL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // 🔒 Отправляет cookies для очистки
      });
    } catch (error) {
      console.error('[AuthAPI] Logout error:', error);
    } finally {
      this.clearTokenRefreshTimer();
      this.isAuthenticated = false;
    }
  }

  /**
   * ✅ Получить текущего пользователя
   */
  async getCurrentUser(): Promise<AuthResponse> {
    const response = await this.authenticatedFetch(`${this.baseURL}/auth/me`);
    
    if (!response.ok) {
      const responseText = await response.text();
      const error = AuthErrorFactory.fromResponse(response, responseText);
      AuthErrorHandler.logError(error, 'getCurrentUser');
      throw error;
    }

    return await response.json();
  }

  /**
   * ✅ Проверка аутентификации (попытка refresh)
   */
  async checkAuth(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      this.isAuthenticated = true;
      this.startTokenRefreshTimer();
      return true;
    } catch {
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * ✅ Принудительное обновление токена
   */
  async forceRefreshToken(): Promise<boolean> {
    return await this.refreshAccessToken();
  }

  /**
   * ✅ Очистить токены (только локальное состояние)
   */
  clearTokens(): void {
    this.clearTokenRefreshTimer();
    this.isAuthenticated = false;
    // HttpOnly cookies очищаются только сервером при logout
  }

  /**
   * ✅ Проверка статуса аутентификации (локальное состояние)
   */
  isAuth(): boolean {
    return this.isAuthenticated;
  }
}

// Экспорт singleton instance
export const authAPI = new AuthAPI();
