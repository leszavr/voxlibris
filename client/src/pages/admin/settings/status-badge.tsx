import { Badge } from "@/components/ui/badge";

import type { HealthStatus } from "./types";

export function StatusBadge({ status }: { readonly status: HealthStatus }) {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          Работает
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          Предупреждение
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          Ошибка
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
