import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

export function AnalyticsPageHeader({ period, setPeriod }: { period: string; setPeriod: (period: string) => void }) {
  return (
    <div className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-3xl font-bold">Аналитика платформы</h1>
        <p className="text-muted-foreground mt-2">Статистика активности пользователей и популярности контента</p>
      </div>

      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Выберите период" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Последние 7 дней</SelectItem>
          <SelectItem value="30d">Последние 30 дней</SelectItem>
          <SelectItem value="90d">Последние 90 дней</SelectItem>
          <SelectItem value="all">За всё время</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
