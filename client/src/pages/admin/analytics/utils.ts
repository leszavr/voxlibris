import type { BookAnalyticsExportDetails, CsvColumn } from './types';

export const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
};

const escapeCsvValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  if (/[;"\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

export const downloadCsv = <T,>(filename: string, rows: T[], columns: CsvColumn<T>[]) => {
  const headerLine = columns.map((col) => escapeCsvValue(col.header)).join(';');
  const lines = rows.map((row, index) =>
    columns.map((col) => escapeCsvValue(col.accessor(row, index))).join(';')
  );
  const csv = [headerLine, ...lines].join('\n');

  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const buildEventsMap = (items: Array<{ eventType: string; count: number }>) => {
  const map: Record<string, number> = {};
  for (const item of items) {
    map[item.eventType] = Number(item.count) || 0;
  }
  return map;
};

export const buildEventsMapFromDailyEvents = (dailyEvents: BookAnalyticsExportDetails['dailyEvents']) => {
  const map: Record<string, number> = {};
  for (const day of dailyEvents) {
    for (const [key, value] of Object.entries(day)) {
      if (key === 'date') continue;
      map[key] = (map[key] || 0) + (Number(value) || 0);
    }
  }
  return map;
};
