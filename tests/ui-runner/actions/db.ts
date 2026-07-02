import postgres from 'postgres';

export interface MembershipRow {
  club_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  muted_until: Date | null;
  deactivated_until: Date | null;
  restriction_reason: string | null;
  restricted_by: string | null;
  restricted_at: Date | null;
}

const clubIds = ['vl-ui-standard-club', 'vl-ui-reader-club', 'vl-ui-other-club'];
const baseMembers = [
  { userId: 'vl-ui-owner', role: 'owner' },
  { userId: 'vl-ui-member', role: 'member' },
];

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export async function resetUiTestData(): Promise<void> {
  await withSql(async (sql) => {
    await sql`
      DELETE FROM club_members
      WHERE club_id IN (${clubIds[0]}, ${clubIds[1]}, ${clubIds[2]})
    `;

    for (const clubId of clubIds) {
      for (const member of baseMembers) {
        await insertMembership(sql, clubId, member.userId, member.role);
      }
    }

    for (const clubId of ['vl-ui-standard-club', 'vl-ui-reader-club']) {
      await insertMembership(sql, clubId, 'vl-ui-other-member', 'member');
    }
  });
}

async function insertMembership(sql: postgres.Sql, clubId: string, userId: string, role: string): Promise<void> {
  await sql`
    INSERT INTO club_members (club_id, user_id, role, is_active, muted_until, deactivated_until, restriction_reason, restricted_by, restricted_at)
    VALUES (${clubId}, ${userId}, ${role}, true, null, null, null, null, null)
  `;
}

export async function getMembership(clubId: string, userId: string): Promise<MembershipRow | null> {
  return withSql(async (sql) => {
    const rows = await sql<MembershipRow[]>`
      SELECT club_id, user_id, role, is_active, muted_until, deactivated_until, restriction_reason, restricted_by, restricted_at
      FROM club_members
      WHERE club_id = ${clubId} AND user_id = ${userId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

export async function setExpiredRestriction(clubId: string, userId: string, field: 'muted_until' | 'deactivated_until'): Promise<void> {
  await withSql(async (sql) => {
    const active = true;
    const expiredAt = new Date('2000-01-01T00:00:00.000Z');
    await sql`
      UPDATE club_members
      SET ${sql(field)} = ${expiredAt},
          is_active = ${active},
          restriction_reason = 'Автотест: истёкшее ограничение',
          restricted_by = 'vl-ui-owner',
          restricted_at = ${expiredAt}
      WHERE club_id = ${clubId} AND user_id = ${userId}
    `;
  });
}

export async function ensureManyMembers(clubId: string, count: number): Promise<void> {
  await withSql(async (sql) => {
    for (let index = 1; index <= count; index += 1) {
      const id = `vl-ui-load-${index.toString().padStart(2, '0')}`;
      await sql`
        INSERT INTO users (id, username, email, password, role, status, email_confirmed)
        VALUES (${id}, ${id.replaceAll('-', '_')}, ${`${id}@example.test`}, 'not-used', 'user', 'active', true)
        ON CONFLICT (id) DO UPDATE SET status = 'active'
      `;
      await sql`
        INSERT INTO user_profiles (user_id, display_name, is_reader, reader_rating)
        VALUES (${id}, ${`VL UI Load ${index}`}, false, 0)
        ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name
      `;
      await sql`DELETE FROM club_members WHERE club_id = ${clubId} AND user_id = ${id}`;
      await insertMembership(sql, clubId, id, 'member');
    }
  });
}

export async function removeMembership(clubId: string, userId: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`DELETE FROM club_members WHERE club_id = ${clubId} AND user_id = ${userId}`;
  });
}

export async function countMemberships(clubId: string): Promise<number> {
  return withSql(async (sql) => {
    const rows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM club_members WHERE club_id = ${clubId}`;
    return Number(rows[0]?.count ?? 0);
  });
}

export async function clearLoadMembers(clubId: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`DELETE FROM club_members WHERE club_id = ${clubId} AND user_id LIKE 'vl-ui-load-%'`;
    await sql`DELETE FROM user_profiles WHERE user_id LIKE 'vl-ui-load-%'`;
    await sql`DELETE FROM users WHERE id LIKE 'vl-ui-load-%'`;
  });
}

export async function getClubMemberCount(clubId: string): Promise<number | null> {
  return withSql(async (sql) => {
    const rows = await sql<{ member_count: number | null }[]>`SELECT member_count FROM clubs WHERE id = ${clubId}`;
    return rows[0]?.member_count ?? null;
  });
}

export async function syncClubMemberCount(clubId: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`
      UPDATE clubs
      SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = ${clubId} AND is_active = true)
      WHERE id = ${clubId}
    `;
  });
}
