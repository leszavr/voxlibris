import { and, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository.js';
import { calendarSubscriptionTokens, type CalendarSubscriptionToken } from '../../shared/schema.js';

export class CalendarSubscriptionRepository extends BaseRepository {
  async getActiveForUserClub(userId: string, clubId: string): Promise<CalendarSubscriptionToken | undefined> {
    const result = await this.db.select().from(calendarSubscriptionTokens).where(and(
      eq(calendarSubscriptionTokens.userId, userId),
      eq(calendarSubscriptionTokens.clubId, clubId),
      isNull(calendarSubscriptionTokens.revokedAt)
    )).limit(1);
    return this.getFirstResult(result);
  }

  async create(userId: string, clubId: string, tokenHash: string): Promise<CalendarSubscriptionToken> {
    const result = await this.db.insert(calendarSubscriptionTokens).values({ userId, clubId, tokenHash }).returning();
    return result[0];
  }

  async revoke(userId: string, clubId: string): Promise<void> {
    await this.db.update(calendarSubscriptionTokens).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(calendarSubscriptionTokens.userId, userId),
      eq(calendarSubscriptionTokens.clubId, clubId),
      isNull(calendarSubscriptionTokens.revokedAt)
    ));
  }

  async rotate(userId: string, clubId: string, tokenHash: string): Promise<CalendarSubscriptionToken> {
    await this.revoke(userId, clubId);
    return this.create(userId, clubId, tokenHash);
  }

  async findActiveByHash(tokenHash: string): Promise<CalendarSubscriptionToken | undefined> {
    const result = await this.db.select().from(calendarSubscriptionTokens).where(and(
      eq(calendarSubscriptionTokens.tokenHash, tokenHash),
      isNull(calendarSubscriptionTokens.revokedAt)
    )).limit(1);
    return this.getFirstResult(result);
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.db.update(calendarSubscriptionTokens).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(calendarSubscriptionTokens.id, id));
  }
}
