import { RepositoryContainer } from './container.js';
import { StorageAdapter } from './storage-adapter.js';

export type { IStorage } from './container.js';
export { RepositoryContainer } from './container.js';

// Создаем singleton instance для обратной совместимости
const storageAdapter = new StorageAdapter();

// Экспортируем адаптер как замену для старого storage
export const storage = storageAdapter;

// Экспортируем контейнер репозиториев для прямого доступа к доменам
export const repositories = new RepositoryContainer();

// Экспортируем отдельные репозитории для удобства
export { UserRepository } from './UserRepository.js';
export { BookRepository } from './BookRepository.js';
export { ClubRepository } from './ClubRepository.js';
export { PersonalBooksRepository } from './PersonalBooksRepository.js';
export { ClubBooksRepository } from './ClubBooksRepository.js';
export { ReadingRepository } from './ReadingRepository.js';
export { ModerationRepository } from './ModerationRepository.js';
export { AnalyticsRepository } from './AnalyticsRepository.js';
export { SystemRepository } from './SystemRepository.js';

// VoxLibris Studio exports
export { ClubReadingStatusRepository } from './ClubReadingStatusRepository.js';
export { SessionReactionsRepository } from './SessionReactionsRepository.js';
export { SessionQuestionsRepository } from './SessionQuestionsRepository.js';
export { SessionAnalyticsRepository } from './SessionAnalyticsRepository.js';
export { ClubMonetizationRepository } from './ClubMonetizationRepository.js';
export { ReaderEarningsRepository } from './ReaderEarningsRepository.js';
export { ListenerPaymentsRepository } from './ListenerPaymentsRepository.js';
export { ClubSubscriptionsRepository } from './ClubSubscriptionsRepository.js';
export { ReadingScheduleRepository } from './ReadingScheduleRepository.js';
export { SessionRecordingsRepository } from './SessionRecordingsRepository.js';
export { ReaderQualityRatingsRepository } from './ReaderQualityRatingsRepository.js';

// Guest System
export * from './GuestRepository.js';
