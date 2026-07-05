import { and, count, eq, inArray } from 'drizzle-orm';

import { BaseRepository } from './BaseRepository.js';
import { clubBooks, clubMembers, clubTags, tags, users } from '../../shared/schema.js';
import type { Club, ClubType, ClubWithDetails } from '../../shared/schema.js';

export function matchesCatalogSearch(
  club: { title: string; description: string | null; bookTitle: string | null; author: string | null },
  q: string,
): boolean {
  return club.title.toLowerCase().includes(q)
    || (club.description ?? '').toLowerCase().includes(q)
    || (club.bookTitle ?? '').toLowerCase().includes(q)
    || (club.author ?? '').toLowerCase().includes(q);
}

export function normalizeCatalogClubType(value: string): ClubType | null {
  return value === 'standard' || value === 'premium' || value === 'reader-led' || value === 'reading_club'
    ? value
    : null;
}

export function buildTagsMap(tagRows: Array<{ clubId: string; slug: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of tagRows) {
    const existing = map.get(row.clubId);
    if (existing) {
      existing.push(row.slug);
    } else {
      map.set(row.clubId, [row.slug]);
    }
  }
  return map;
}

export function parseReaderJoinRequestsEnabled(settings: string | null | undefined): boolean {
  if (!settings) return true;

  try {
    const parsed = JSON.parse(settings) as { readerJoinRequestsEnabled?: unknown };
    return parsed.readerJoinRequestsEnabled !== false;
  } catch {
    return true;
  }
}

export abstract class ClubRepositoryBase extends BaseRepository {
  protected async enrichClubList(
    clubsData: Club[],
    options: {
      includeBook?: boolean;
      includeTags?: boolean;
    } = {},
  ): Promise<ClubWithDetails[]> {
    if (clubsData.length === 0) {
      return [];
    }

    const includeBook = options.includeBook ?? true;
    const includeTags = options.includeTags ?? true;
    const clubIds = clubsData.map((club) => club.id);
    const ownerIds = Array.from(new Set(clubsData.map((club) => club.ownerId)));

    const [owners, memberCounts, latestBooks, tagRows] = await Promise.all([
      ownerIds.length > 0
        ? this.db.select().from(users).where(inArray(users.id, ownerIds))
        : Promise.resolve([] as (typeof users.$inferSelect)[]),
      this.db
        .select({
          clubId: clubMembers.clubId,
          count: count(),
        })
        .from(clubMembers)
        .where(inArray(clubMembers.clubId, clubIds))
        .groupBy(clubMembers.clubId),
      includeBook
        ? (() => {
            const activeBookIds = clubsData
              .map((c) => c.bookId)
              .filter((id): id is string => id !== null && id !== undefined);
            if (activeBookIds.length === 0) return Promise.resolve([] as (typeof clubBooks.$inferSelect)[]);
            return this.db
              .select()
              .from(clubBooks)
              .where(and(
                inArray(clubBooks.id, activeBookIds),
                eq(clubBooks.isDeleted, false),
              ));
          })()
        : Promise.resolve([] as (typeof clubBooks.$inferSelect)[]),
      includeTags
        ? this.db
            .select({
              clubId: clubTags.clubId,
              slug: tags.slug,
            })
            .from(clubTags)
            .innerJoin(tags, eq(clubTags.tagId, tags.id))
            .where(inArray(clubTags.clubId, clubIds))
        : Promise.resolve([] as Array<{ clubId: string; slug: string }>),
    ]);

    const ownersMap = new Map(owners.map((owner) => [owner.id, owner]));
    const memberCountMap = new Map(
      memberCounts.map((entry) => [entry.clubId, Number(entry.count || 0)]),
    );

    const activeBookMap = new Map<string, typeof clubBooks.$inferSelect>();
    for (const book of latestBooks) {
      activeBookMap.set(book.id, book);
    }

    const tagsMap = new Map<string, string[]>();
    for (const row of tagRows) {
      const existing = tagsMap.get(row.clubId);
      if (existing) {
        existing.push(row.slug);
      } else {
        tagsMap.set(row.clubId, [row.slug]);
      }
    }

    return clubsData.map((club) => {
      const activeBook = includeBook && club.bookId ? activeBookMap.get(club.bookId) ?? null : null;
      return {
        ...club,
        book: activeBook,
        owner: ownersMap.get(club.ownerId) || null,
        memberCount: memberCountMap.get(club.id) || 0,
        tags: includeTags ? (tagsMap.get(club.id) || []) : [],
      };
    }) as ClubWithDetails[];
  }
}
