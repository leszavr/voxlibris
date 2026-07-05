export const eventTypeLabels: Record<string, string> = {
  book_open: 'Открытие книги',
  chapter_start: 'Начало главы',
  chapter_complete: 'Завершение главы',
  reading_session: 'Сессия чтения',
  bookmark_create: 'Закладка',
  note_create: 'Заметка',
  book_complete: 'Завершение книги',
  club_join: 'Вступление в клуб',
  club_leave: 'Выход из клуба',
  book_upload: 'Загрузка книги',
  pwa_install: 'Установка PWA',
  pwa_homescreen_open: 'Запуск с домашнего экрана',
};

export const mobilePwaEventLabels: Record<string, string> = {
  pwa_install: 'Установка PWA',
  pwa_homescreen_open: 'Запуск с домашнего экрана',
  mobile_reader_open: 'Открытие ридера с мобильного',
  mobile_club_join: 'Вступление в клуб с мобильного',
};

export const funnelStageLabels: Record<string, string> = {
  book_open: 'Открыли книгу',
  reading_session: 'Начали читать',
  chapter_complete: 'Завершили главу',
  book_complete: 'Завершили книгу',
};

export const funnelStageColors: Record<string, string> = {
  book_open: '#3b82f6',
  reading_session: '#8b5cf6',
  chapter_complete: '#f59e0b',
  book_complete: '#10b981',
};

export const deviceTypeLabels: Record<string, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
  unknown: 'Unknown',
};

export const deviceTypeColors: Record<string, string> = {
  desktop: '#2563eb',
  mobile: '#16a34a',
  tablet: '#f59e0b',
  unknown: '#64748b',
};

export const displayModeLabels: Record<string, string> = {
  browser: 'Браузер',
  standalone: 'Установленное приложение',
};

export const displayModeColors: Record<string, string> = {
  browser: '#0284c7',
  standalone: '#7c3aed',
};

export const mobilePwaSourceLabels: Record<string, string> = {
  install_prompt: 'Install prompt',
  homescreen: 'Домашний экран',
  personal_reader: 'Личный ридер',
  club_reader: 'Клубный ридер',
  invite_accept: 'Принятие приглашения',
};

export const dayLabelsLong = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

export const detailedEventTypes = Object.keys(eventTypeLabels);
