import { UserRepository } from './UserRepository.js';
import { BookRepository } from './BookRepository.js';
import { ClubRepository } from './ClubRepository.js';
import { PersonalBooksRepository } from './PersonalBooksRepository.js';
import { ClubBooksRepository } from './ClubBooksRepository.js';
import { GenresRepository } from './GenresRepository.js';
import { ReadingRepository } from './ReadingRepository.js';
import { ModerationRepository } from './ModerationRepository.js';
import { AnalyticsRepository } from './AnalyticsRepository.js';
import { SystemRepository } from './SystemRepository.js';
import { ClubDiscussionsRepository } from './ClubDiscussionsRepository.js';

// VoxLibris Studio repositories
import { ClubReadingStatusRepository } from './ClubReadingStatusRepository.js';
import { SessionReactionsRepository } from './SessionReactionsRepository.js';
import { SessionQuestionsRepository } from './SessionQuestionsRepository.js';
import { SessionAnalyticsRepository } from './SessionAnalyticsRepository.js';
import { ClubMonetizationRepository } from './ClubMonetizationRepository.js';
import { ReaderEarningsRepository } from './ReaderEarningsRepository.js';
import { ListenerPaymentsRepository } from './ListenerPaymentsRepository.js';
import { ClubSubscriptionsRepository } from './ClubSubscriptionsRepository.js';
import { ReadingScheduleRepository } from './ReadingScheduleRepository.js';
import { SessionRecordingsRepository } from './SessionRecordingsRepository.js';
import { ReaderQualityRatingsRepository } from './ReaderQualityRatingsRepository.js';
import { SocialRepository } from './SocialRepository.js';
import { DmRepository } from './DmRepository.js';
import { GamificationRepository } from './GamificationRepository.js';
import { CommerceRepository } from './CommerceRepository.js';
import { CalendarSubscriptionRepository } from './CalendarSubscriptionRepository.js';

/**
 * Интерфейс для обратной совместимости со старым IStorage
 * Используется только для типизации StorageAdapter
 */
export interface IStorage {}

export type LegacyReadingSessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';

/**
 * Главный композитный репозиторий - архитектурная замена монолитного storage.ts
 * 
 * АРХИТЕКТУРНОЕ РЕШЕНИЕ:
 * - Принцип единственной ответственности (SRP): каждый репозиторий отвечает за свой домен
 * - Композиция вместо наследования: объединяем функциональность через делегирование
 * - Инверсия зависимостей: высокоуровневые модули не зависят от низкоуровневых
 * - Интерфейс сегрегации: разделение больших интерфейсов на специализированные
 * 
 * ПРЕИМУЩЕСТВА:
 * - Устранение нарушения SRP (2760 строк -> модульная архитектура)
 * - Упрощение тестирования (изолированные домены)
 * - Повышение maintainability (изменения в одном домене не влияют на другие)
 * - Соблюдение SOLID принципов
 */
export class RepositoryContainer {
  private _users?: UserRepository;
  private _books?: BookRepository;
  private _clubs?: ClubRepository;
  private _personalBooks?: PersonalBooksRepository;
  private _clubBooks?: ClubBooksRepository;
  private _genres?: GenresRepository;
  private _reading?: ReadingRepository;
  private _moderation?: ModerationRepository;
  private _analytics?: AnalyticsRepository;
  private _system?: SystemRepository;
  private _clubDiscussions?: ClubDiscussionsRepository;

  // VoxLibris Studio repositories
  private _clubReadingStatus?: ClubReadingStatusRepository;
  private _sessionReactions?: SessionReactionsRepository;
  private _sessionQuestions?: SessionQuestionsRepository;
  private _sessionAnalytics?: SessionAnalyticsRepository;
  private _clubMonetization?: ClubMonetizationRepository;
  private _readerEarnings?: ReaderEarningsRepository;
  private _listenerPayments?: ListenerPaymentsRepository;
  private _clubSubscriptions?: ClubSubscriptionsRepository;
  private _readingSchedule?: ReadingScheduleRepository;
  private _sessionRecordings?: SessionRecordingsRepository;
  private _readerQualityRatings?: ReaderQualityRatingsRepository;
  private _social?: SocialRepository;
  private _dm?: DmRepository;
  private _gamification?: GamificationRepository;
  private _commerce?: CommerceRepository;
  private _calendarSubscriptions?: CalendarSubscriptionRepository;

  // Ленивая инициализация репозиториев
  get users(): UserRepository {
    this._users ??= new UserRepository();
    return this._users;
  }

  get books(): BookRepository {
    this._books ??= new BookRepository();
    return this._books;
  }

  get clubs(): ClubRepository {
    this._clubs ??= new ClubRepository();
    return this._clubs;
  }

  get personalBooks(): PersonalBooksRepository {
    this._personalBooks ??= new PersonalBooksRepository();
    return this._personalBooks;
  }

  get clubBooks(): ClubBooksRepository {
    this._clubBooks ??= new ClubBooksRepository();
    return this._clubBooks;
  }

  get genres(): GenresRepository {
    this._genres ??= new GenresRepository();
    return this._genres;
  }

  get reading(): ReadingRepository {
    this._reading ??= new ReadingRepository();
    return this._reading;
  }

  get moderation(): ModerationRepository {
    this._moderation ??= new ModerationRepository();
    return this._moderation;
  }

  get analytics(): AnalyticsRepository {
    this._analytics ??= new AnalyticsRepository();
    return this._analytics;
  }

  get system(): SystemRepository {
    this._system ??= new SystemRepository();
    return this._system;
  }

  get clubDiscussions(): ClubDiscussionsRepository {
    this._clubDiscussions ??= new ClubDiscussionsRepository();
    return this._clubDiscussions;
  }

  // VoxLibris Studio getters
  get clubReadingStatus(): ClubReadingStatusRepository {
    this._clubReadingStatus ??= new ClubReadingStatusRepository();
    return this._clubReadingStatus;
  }

  get sessionReactions(): SessionReactionsRepository {
    this._sessionReactions ??= new SessionReactionsRepository();
    return this._sessionReactions;
  }

  get sessionQuestions(): SessionQuestionsRepository {
    this._sessionQuestions ??= new SessionQuestionsRepository();
    return this._sessionQuestions;
  }

  get sessionAnalytics(): SessionAnalyticsRepository {
    this._sessionAnalytics ??= new SessionAnalyticsRepository();
    return this._sessionAnalytics;
  }

  get clubMonetization(): ClubMonetizationRepository {
    this._clubMonetization ??= new ClubMonetizationRepository();
    return this._clubMonetization;
  }

  get readerEarnings(): ReaderEarningsRepository {
    this._readerEarnings ??= new ReaderEarningsRepository();
    return this._readerEarnings;
  }

  get listenerPayments(): ListenerPaymentsRepository {
    this._listenerPayments ??= new ListenerPaymentsRepository();
    return this._listenerPayments;
  }

  get clubSubscriptions(): ClubSubscriptionsRepository {
    this._clubSubscriptions ??= new ClubSubscriptionsRepository();
    return this._clubSubscriptions;
  }

  get readingSchedule(): ReadingScheduleRepository {
    this._readingSchedule ??= new ReadingScheduleRepository();
    return this._readingSchedule;
  }

  get sessionRecordings(): SessionRecordingsRepository {
    this._sessionRecordings ??= new SessionRecordingsRepository();
    return this._sessionRecordings;
  }

  get readerQualityRatings(): ReaderQualityRatingsRepository {
    this._readerQualityRatings ??= new ReaderQualityRatingsRepository();
    return this._readerQualityRatings;
  }

  get social(): SocialRepository {
    this._social ??= new SocialRepository();
    return this._social;
  }

  get calendarSubscriptions(): CalendarSubscriptionRepository {
    this._calendarSubscriptions ??= new CalendarSubscriptionRepository();
    return this._calendarSubscriptions;
  }

  get dm(): DmRepository {
    this._dm ??= new DmRepository();
    return this._dm;
  }

  get gamification(): GamificationRepository {
    this._gamification ??= new GamificationRepository();
    return this._gamification;
  }

  get commerce(): CommerceRepository {
    this._commerce ??= new CommerceRepository();
    return this._commerce;
  }
}
