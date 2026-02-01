import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { User } from '../../../shared/schema';
import { authAPI } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (username: string, email: string, password: string, rememberMe?: boolean, inviteToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  syncAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  readonly children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const fetchCurrentUser = async () => {
    try {
      // Токен в HttpOnly cookie, просто делаем запрос
      const response = await authAPI.getCurrentUser();
      setUser(response.user);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[useAuth] Failed to fetch current user:', error);
      }
      // Очищаем состояние при ошибке
      authAPI.clearTokens();
      setUser(null);
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await authAPI.login({ username, password, rememberMe });
      setUser(response.user);
    } catch (error) {
      // Очищаем состояние при неудачном входе
      authAPI.clearTokens();
      setUser(null);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string, rememberMe: boolean = false, inviteToken?: string) => {
    try {
      const payload: any = { username, email, password, rememberMe };
      if (inviteToken) payload.invite = inviteToken;
      const response = await authAPI.register(payload);
      setUser(response.user);
    } catch (error) {
      // Очищаем состояние при неудачной регистрации
      authAPI.clearTokens();
      setUser(null);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[useAuth] Logout request failed:', error);
      }
      // Продолжаем выход даже если запрос не удался
    } finally {
      // Всегда очищаем локальное состояние
      authAPI.clearTokens();
      setUser(null);
    }
  };

  const refetchUser = async () => {
    setIsLoading(true);
    await fetchCurrentUser();
    setIsLoading(false);
  };

  // Принудительная синхронизация состояния с сервером
  const syncAuthState = async () => {
    setIsLoading(true);
    try {
      // Проверяем auth через запрос к серверу
      const authSuccess = await authAPI.checkAuth();
      if (!authSuccess) {
        setUser(null);
        return;
      }

      // Получаем актуальные данные пользователя
      await fetchCurrentUser();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[useAuth] Auth sync failed:', error);
      }
      authAPI.clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Инициализация при монтировании
    refetchUser();

    // Периодическая проверка состояния токена (каждые 5 минут)
    const interval = setInterval(() => {
      if (authAPI.isAuth()) {
        fetchCurrentUser().catch(() => {
          // Если проверка не удалась, очищаем состояние
          authAPI.clearTokens();
          setUser(null);
        });
      }
    }, 5 * 60 * 1000);

    // Слушаем событие auth-error для автоматического logout
    const handleAuthError = () => {
      authAPI.clearTokens();
      setUser(null);
    };
    window.addEventListener('auth-error', handleAuthError);

    return () => {
      clearInterval(interval);
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, []);

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refetchUser,
    syncAuthState,
  }), [user, isAuthenticated, isLoading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}