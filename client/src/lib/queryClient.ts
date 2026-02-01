import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// 🔒 HttpOnly cookies - токены управляются сервером
// Клиент не имеет доступа к JWT токенам

// Обновить access token через refresh token (оба в HttpOnly cookies)
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Защита от одновременных запросов на обновление
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // 🔒 Отправляет refreshToken cookie
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      // ✅ Сервер установил новый accessToken cookie
      // Клиент не получает токен в JSON
      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[QueryClient] Refresh failed:', error);
      }
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Обработка 403 ошибок
async function handle403Error(text: string, res: Response): Promise<never> {
  try {
    const errorData = JSON.parse(text);
    
    // Ошибка активации аккаунта
    if (errorData.code === 'ACCOUNT_NOT_ACTIVATED') {
      const statusMessages: Record<string, string> = {
        'pending': 'Ваш аккаунт ожидает активации администратором.',
        'suspended': 'Ваш аккаунт заблокирован.',
      };
      const statusMessage = statusMessages[errorData.userStatus] || 'Ваш аккаунт неактивен.';
      
      globalThis.dispatchEvent(new CustomEvent('account-status-changed', { 
        detail: { status: errorData.userStatus } 
      }));
      
      throw new Error(statusMessage);
    }
    
    // Ошибка подтверждения email
    if (errorData.code === 'EMAIL_NOT_CONFIRMED') {
      globalThis.dispatchEvent(new CustomEvent('email-verification-required'));
      throw new Error('Необходимо подтвердить email для доступа к этой функции.');
    }
    
    // Ошибка доступа к приватному клубу
    if (errorData.code === 'PRIVATE_CLUB_ACCESS_DENIED') {
      throw new Error(errorData.message || 'Это закрытый клуб. Для доступа необходимо получить приглашение.');
    }
    
    throw new Error(errorData.message || text || res.statusText);
  } catch (parseError) {
    if (parseError instanceof SyntaxError) {
      throw new Error(text || res.statusText);
    }
    throw parseError;
  }
}

// Создание fetch запроса с правильными заголовками
function createFetchRequest(url: string, options?: RequestInit): Promise<Response> {
  const isFormData = options?.body instanceof FormData;
  
  return fetch(url, {
    method: options?.method || 'GET',
    headers: {
      ...(!isFormData && options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers as Record<string, string>),
    },
    body: options?.body,
    credentials: "include",
  });
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let res = await createFetchRequest(url, options);

  // Если получили 401, пробуем обновить токен один раз
  if (res.status === 401) {
    try {
      const refreshSuccess = await refreshAccessToken();
      
      if (refreshSuccess) {
        res = await createFetchRequest(url, options);
      }
    } catch (error) {
      console.error('[QueryClient] Token refresh failed on 401:', error);
      // Не выбрасываем ошибку, а возвращаем 401 как есть - UI обработает
    }
  }

  // Проверяем статус ответа и обрабатываем специфичные ошибки
  if (!res.ok) {
    const text = await res.text();
    
    if (res.status === 401) {
      throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.');
    }
    
    if (res.status === 403) {
      return handle403Error(text, res);
    }
    
    throw new Error(`${res.status}: ${text}`);
  }

  // Проверяем, есть ли контент для парсинга
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return await res.json() as T;
  }

  // Для пустых ответов или non-JSON возвращаем как есть
  return undefined as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      let res = await fetch(queryKey.join("/"), {
        credentials: "include", // 🔒 HttpOnly cookies
      });

      // Если получили 401, пробуем обновить токен
      if (res.status === 401) {
        try {
          const refreshSuccess = await refreshAccessToken();
          
          if (refreshSuccess) {
            // Повторяем запрос с обновленным cookie
            res = await fetch(queryKey.join("/"), {
              credentials: "include",
            });
          }
        } catch (error) {
          if (unauthorizedBehavior === "returnNull") {
            return null;
          }
          throw error;
        }
      }

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
