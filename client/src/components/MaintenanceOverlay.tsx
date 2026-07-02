import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

interface GeneralSettings {
  maintenanceMode: boolean;
  maintenanceReason: string;
  maintenanceUntil: string;
  maintenanceMessage: string;
}

async function fetchPublicGeneralSettings(): Promise<GeneralSettings> {
  const response = await apiRequest<{ settings: GeneralSettings }>("/api/v1/admin/settings/general/public", {
    cache: "no-store",
  });
  return response.settings;
}

export function MaintenanceOverlay() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["public-general-settings"],
    queryFn: fetchPublicGeneralSettings,
    refetchInterval: 10_000,
  });

  const isAdmin = user?.role === "admin";
  const enabled = Boolean(data?.maintenanceMode && !isAdmin);

  useEffect(() => {
    if (!enabled) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-md">
      <div className="absolute inset-0 cursor-not-allowed" aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-2xl border bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-50 p-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Режим обслуживания</h2>
              <p className="mt-1 text-sm text-gray-600">
                Платформа временно недоступна для пользователей.
              </p>
            </div>

            {data?.maintenanceReason ? (
              <div>
                <div className="text-sm font-medium text-gray-900">Причина</div>
                <div className="text-sm text-gray-600">{data.maintenanceReason}</div>
              </div>
            ) : null}

            {data?.maintenanceUntil ? (
              <div>
                <div className="text-sm font-medium text-gray-900">Ориентировочное завершение</div>
                <div className="text-sm text-gray-600">{data.maintenanceUntil}</div>
              </div>
            ) : null}

            {data?.maintenanceMessage ? (
              <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                {data.maintenanceMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
