import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";

export function AnalyticsEmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Нет данных за выбранный период</h2>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          Данные аналитики собираются автоматически при чтении книг в ридере.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl">
          <h3 className="font-semibold text-blue-900 mb-3">Как начать собирать статистику:</h3>
          <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
            <li>Загрузите книгу в личную библиотеку или клуб</li>
            <li>Откройте книгу через Reader (кнопка "Читать")</li>
            <li>Начните чтение - события будут отправляться автоматически каждые 30 секунд</li>
            <li>Вернитесь на эту страницу через минуту - данные появятся</li>
          </ol>
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs text-blue-700">
              <strong>Отслеживаемые события:</strong> открытие книги, начало/завершение главы, сессии чтения,
              создание закладок и заметок
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
