import express from 'express';
import crypto from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { jwtAuth, optionalJwtAuth } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import { db } from '../../db.js';
import { emailService } from '../../services/email-service.js';
import { logger } from '../../lib/logger.js';
import { getPublicBaseUrl } from '../../lib/public-base-url.js';
import { clubMembers, clubs } from '../../../shared/schema.js';
import type { InsertClubInvitation, UserRole } from '../../../shared/schema.js';
import { isReaderLedClub } from '../../lib/reader-club-access.js';
import { EntitlementError, EntitlementService } from '../../services/commerce/entitlement-service.js';

const router = express.Router();

async function countActiveClubMembers(clubId: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.isActive, true)));
  return row?.count ?? 0;
}

async function countJoinedStandardClubs(userId: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(clubMembers)
    .innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
    .where(and(eq(clubMembers.userId, userId), eq(clubMembers.isActive, true), ne(clubs.type, 'reader-led')));
  return row?.count ?? 0;
}

function entitlementDenied(error: EntitlementError) {
  return { message: error.message, code: error.code, featureKey: error.featureKey, upgradeUrl: '/pricing' };
}

async function canManageClubInvitations(clubId: string, userId: string) {
  const club = await storage.getClub(clubId);
  if (!club) return { club: undefined, allowed: false, owner: false };

  const membership = await storage.getUserClubMembership(club.id, userId);
  const owner = club.ownerId === userId || membership?.role === 'owner';
  return {
    club,
    owner,
    allowed: owner || membership?.role === 'moderator',
  };
}

// Helper: robust lookup of invitation by token with small fallbacks
async function findInvitationByToken(token: string) {
  if (!token) return undefined;
  // try direct lookup
  let inv = await storage.getClubInvitation(token);
  if (inv) return inv;

  // try decoded
  try {
    const decoded = decodeURIComponent(token);
    if (decoded && decoded !== token) {
      inv = await storage.getClubInvitation(decoded);
      if (inv) return inv;
    }
  } catch (err) {
    console.warn('Failed to decode invite token:', err);
  }

  // try lowercase
  const lower = token.toLowerCase();
  if (lower !== token) {
    inv = await storage.getClubInvitation(lower);
    if (inv) return inv;
  }

  return undefined;
}

/**
 * POST /api/clubs/:id/invite
 * Пригласить участника в клуб по email
 */
router.post('/:id/invite', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const requestedUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    let email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (requestedUserId) {
      const invitedUser = await storage.getUser(requestedUserId);
      if (!invitedUser || invitedUser.status !== 'active') {
        return res.status(404).json({ message: 'User not found' });
      }
      email = invitedUser.email.trim().toLowerCase();
    }

    const atIndex = email.indexOf('@');
    const dotAfterAt = email.lastIndexOf('.');
    const hasWhitespace = email.includes(' ');
    const isEmailValid = email.length > 5
      && atIndex > 0
      && dotAfterAt > atIndex + 1
      && dotAfterAt < email.length - 1
      && !hasWhitespace;

    if (!isEmailValid) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    const access = await canManageClubInvitations(req.params.id, req.user.userId);
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const club = access.club;
    if (!access.allowed) {
      return res.status(403).json({ message: 'Only club owner or moderator can invite members' });
    }

    // Проверяем, не заполнен ли клуб
    if (club.memberCount >= club.maxMembers) {
      return res.status(409).json({ message: 'Club is full' });
    }

    // Проверяем, не существует ли уже активное приглашение для этого email
    const existingInvitations = await storage.getClubInvitations(club.id);
    const activeInvitation = existingInvitations.find(
      inv => inv.email === email && inv.status === 'pending' && new Date(inv.expiresAt) > new Date()
    );

    if (activeInvitation) {
      return res.status(409).json({ message: 'Active invitation already exists for this email' });
    }

    // Генерируем уникальный токен приглашения
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Приглашение действительно 7 дней
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Создаем запись в БД
    const invitation: InsertClubInvitation = {
      clubId: club.id,
      email,
      invitedBy: req.user.userId,
      inviteToken,
      expiresAt,
    };

    const createdInvitation = await storage.createClubInvitation(invitation);

    // Отправляем email
    const baseUrl = await getPublicBaseUrl();
    const emailSent = await emailService.sendClubInvitation({
      email,
      clubName: club.title,
      clubDescription: club.description || 'Присоединяйтесь к нашему клубу!',
      inviterName: req.user.username,
      inviteToken,
      expiresAt,
      baseUrl,
    });

    if (!emailSent) {
      console.warn(`[Clubs] Email invitation not sent to ${email} - SMTP may not be configured`);
    }

    logger.info(`[Clubs] Invitation sent to ${email} for club "${club.title}" by ${req.user.username}`);

    res.status(201).json({
      message: emailSent 
        ? 'Invitation sent successfully' 
        : 'Invitation created but email not sent (SMTP not configured)',
      invitation: {
        id: createdInvitation.id,
        email: createdInvitation.email,
        status: createdInvitation.status,
        expiresAt: createdInvitation.expiresAt,
        emailSent,
      }
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ message: 'Failed to send invitation' });
  }
});

/**
 * GET /api/clubs/:id/invitations
 * Получить список приглашений клуба (только для владельца и модератора)
 */
router.get('/:id/invitations', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const access = await canManageClubInvitations(req.params.id, req.user.userId);
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права: владелец/модератор клуба или админ/модератор системы
    const userRole = req.user.role as UserRole;
    const isSystemAdmin = userRole === 'admin' || userRole === 'moderator';
    
    if (!isSystemAdmin && !access.allowed) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invitations = await storage.getClubInvitations(access.club.id);

    // Получаем информацию о пригласивших пользователях
    const invitationsWithInviters = await Promise.all(
      invitations.map(async (inv) => {
        const inviter = await storage.getUser(inv.invitedBy);
        return {
          id: inv.id,
          email: inv.email,
          status: inv.status,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
          acceptedAt: inv.acceptedAt,
          inviterName: inviter?.username || null,
        };
      })
    );

    res.json({ invitations: invitationsWithInviters });
  } catch (error) {
    console.error('Error getting invitations:', error);
    res.status(500).json({ message: 'Failed to get invitations' });
  }
});

/**
 * GET /api/invitations/:token
 * Получить информацию о приглашении по токену
 */
router.get('/invitations/:token', async (req, res) => {
  try {
    const invitation = await findInvitationByToken(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем срок действия
    if (new Date(invitation.expiresAt) < new Date()) {
      await storage.updateInvitationStatus(req.params.token, 'expired');
      return res.status(410).json({ message: 'Invitation has expired' });
    }

    // Получаем информацию о клубе
    const club = await storage.getClub(invitation.clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Получаем информацию о пригласившем пользователе
    const inviter = await storage.getUser(invitation.invitedBy);

    res.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        inviterName: inviter?.username || null,
      },
      club: {
        id: club.id,
        title: club.title,
        description: club.description,
        isPrivate: club.isPrivate,
        memberCount: club.memberCount,
        maxMembers: club.maxMembers,
      },
    });
  } catch (error) {
    console.error('Error getting invitation:', error);
    res.status(500).json({ message: 'Failed to get invitation' });
  }
});

/**
 * POST /api/invitations/:token/accept
 * Принять приглашение в клуб
 */
router.post('/invitations/:token/accept', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const invitation = await findInvitationByToken(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем статус приглашения
    if (invitation.status !== 'pending') {
      return res.status(409).json({ 
        message: `Invitation already ${invitation.status}` 
      });
    }

    // Проверяем срок действия
    if (new Date(invitation.expiresAt) < new Date()) {
      await storage.updateInvitationStatus(req.params.token, 'expired');
      return res.status(410).json({ message: 'Invitation has expired' });
    }

    const club = await storage.getClub(invitation.clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const currentUser = await storage.getUser(req.user.userId);
    if (!currentUser) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }

    if (invitation.email && currentUser.email && invitation.email.toLowerCase() !== currentUser.email.toLowerCase()) {
      return res.status(403).json({
        message: 'Этот инвайт предназначен для другого email. Пожалуйста, войдите под приглашённым аккаунтом или зарегистрируйтесь.',
        code: 'INVITE_EMAIL_MISMATCH'
      });
    }

    // Проверяем, не заполнен ли клуб
    if (club.memberCount >= club.maxMembers) {
      return res.status(409).json({ message: 'Club is full' });
    }

    if (!isReaderLedClub(club)) {
      try {
        await new EntitlementService().assertLimit(req.user.userId, 'clubs.joined.max_count', await countJoinedStandardClubs(req.user.userId), { scopeType: 'platform' });
        await new EntitlementService().assertLimit(club.ownerId, 'club.members.max_count', await countActiveClubMembers(club.id), { scopeType: 'club', scopeId: club.id });
      } catch (error) {
        if (error instanceof EntitlementError) return res.status(403).json(entitlementDenied(error));
        throw error;
      }
    }

    // Проверяем, не является ли пользователь уже участником
    const existingMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (existingMembership) {
      // Обновляем статус приглашения
      await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());
      return res.status(409).json({ message: 'You are already a member of this club' });
    }

    // Добавляем пользователя в клуб
    const membership = await storage.joinClub(club.id, req.user.userId, 'member');

    // Обновляем статус приглашения
    await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());

    // Отправляем уведомление владельцу клуба
    const inviter = await storage.getUser(invitation.invitedBy);
    if (inviter) {
      const baseUrl = await getPublicBaseUrl();
      await emailService.sendInvitationAccepted({
        email: inviter.username, // assuming username is email
        clubName: club.title,
        memberName: req.user.username,
        baseUrl,
      });
    }

    logger.info(`[Clubs] User ${req.user.username} accepted invitation to club "${club.title}"`);

    res.json({
      message: 'Successfully joined the club',
      club: {
        id: club.id,
        title: club.title,
        description: club.description,
      },
      membership,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

/**
 * POST /api/invitations/:token/decline
 * Отклонить приглашение в клуб
 */
router.post('/invitations/:token/decline', optionalJwtAuth, async (req, res) => {
  try {
    const invitation = await storage.getClubInvitation(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем статус приглашения
    if (invitation.status !== 'pending') {
      return res.status(409).json({ 
        message: `Invitation already ${invitation.status}` 
      });
    }

    // Вместо установки статуса 'declined' удаляем приглашение —
    // система ожидает, что приглашение либо создано, либо удалено.
    const deleted = await storage.deleteClubInvitation(invitation.id);
    const tokenPreview = req.params.token.substring(0, 8) + '...';
    if (!deleted) {
      console.warn(`[Clubs] Failed to delete declined invitation token ${tokenPreview}`);
      return res.status(500).json({ message: 'Failed to decline invitation' });
    }

    logger.info(`[Clubs] Invitation token ${tokenPreview} declined and deleted`);

    res.json({ message: 'Invitation declined and removed' });
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({ message: 'Failed to decline invitation' });
  }
});

/**
 * DELETE /api/clubs/:clubId/invitations/:invitationId
 * Отозвать приглашение (только владелец и модератор)
 */
router.delete('/:clubId/invitations/:invitationId', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId, invitationId } = req.params;

    const access = await canManageClubInvitations(clubId, req.user.userId);
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!access.allowed) {
      return res.status(403).json({ message: 'Only club owner or moderator can revoke invitations' });
    }

    const success = await storage.deleteClubInvitation(invitationId);
    if (!success) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    logger.info(`[Clubs] Invitation ${invitationId} revoked by ${req.user.username}`);

    res.json({ message: 'Invitation revoked successfully' });
  } catch (error) {
    console.error('Error revoking invitation:', error);
    res.status(500).json({ message: 'Failed to revoke invitation' });
  }
});

/**
 * POST /api/clubs/:clubId/invitations/by-email
 * Удалить все приглашения для указанного email (для очистки приглашений)
 */
router.post('/:clubId/invitations/by-email', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    const { email } = req.body;

    logger.info(`[Clubs] Remove invitations request: clubId=${clubId}, email=${email}`);

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }

    const access = await canManageClubInvitations(clubId, req.user.userId);
    logger.info({ found: Boolean(access.club) }, '[Clubs] Club found');
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!access.allowed) {
      return res.status(403).json({ message: 'Only club owner or moderator can remove invitations' });
    }

    const deletedCount = await storage.deleteClubInvitationsByEmail(clubId, email.toLowerCase());

    logger.info(`[Clubs] Invitations for ${email} removed by ${req.user.username}: ${deletedCount} invitations deleted`);

    res.json({ 
      message: `Invitations removed successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error removing invitations by email:', error);
    res.status(500).json({ message: 'Failed to remove invitations' });
  }
});

/**
 * DELETE /api/clubs/:clubId/invitations
 * Удалить все приглашения клуба (только владелец)
 */
router.delete('/:clubId/invitations', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    logger.info(`[Clubs] Clear all invitations request: clubId=${clubId}`);

    const access = await canManageClubInvitations(clubId, req.user.userId);
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!access.owner) {
      return res.status(403).json({ message: 'Only club owner can clear all invitations' });
    }

    const invitations = await storage.getClubInvitations(clubId);
    let deletedCount = 0;
    
    for (const inv of invitations) {
      await storage.deleteClubInvitation(inv.id);
      deletedCount++;
    }

    logger.info(`[Clubs] All invitations cleared by ${req.user.username}: ${deletedCount} invitations deleted`);

    res.json({ 
      message: `All invitations cleared successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error clearing all invitations:', error);
    res.status(500).json({ message: 'Failed to clear invitations' });
  }
});

/**
 * DELETE /api/clubs/:clubId/invitations/:invitationId
 * Отозвать приглашение (только владелец и модератор)
 */
router.post('/:clubId/invitations/by-email', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }

    const access = await canManageClubInvitations(clubId, req.user.userId);
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!access.allowed) {
      return res.status(403).json({ message: 'Only club owner or moderator can remove invitations' });
    }

    const deletedCount = await storage.deleteClubInvitationsByEmail(clubId, email.toLowerCase());

    logger.info(`[Clubs] Invitations for ${email} removed by ${req.user.username}: ${deletedCount} invitations deleted`);

    res.json({ 
      message: `Invitations removed successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error removing invitations by email:', error);
    res.status(500).json({ message: 'Failed to remove invitations' });
  }
});

/**
 * POST /api/clubs/:clubId/invitations/:invitationId/resend
 * Пересоздать приглашение для ранее приглашенного участника
 */
router.post('/:clubId/invitations/:invitationId/resend', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId, invitationId } = req.params;

    const access = await canManageClubInvitations(clubId, req.user.userId);
    if (!access.club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!access.allowed) {
      return res.status(403).json({ message: 'Only club owner or moderator can resend invitations' });
    }

    // Получаем существующее приглашение
    const existingInvitations = await storage.getClubInvitations(clubId);
    const oldInvitation = existingInvitations.find(inv => inv.id === invitationId);
    
    if (!oldInvitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем, не существует ли уже активное приглашение для этого email
    const activeInvitation = existingInvitations.find(
      inv => inv.email === oldInvitation.email && 
      inv.status === 'pending' && 
      inv.id !== invitationId &&
      new Date(inv.expiresAt) > new Date()
    );

    if (activeInvitation) {
      return res.status(409).json({ message: 'Active invitation already exists for this email' });
    }

    // Удаляем старое приглашение
    await storage.deleteClubInvitation(invitationId);

    // Генерируем новый токен приглашения
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Новое приглашение действительно 7 дней
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Создаем новое приглашение
    const newInvitation: InsertClubInvitation = {
      clubId: access.club.id,
      email: oldInvitation.email,
      invitedBy: req.user.userId,
      inviteToken,
      expiresAt,
    };

    const createdInvitation = await storage.createClubInvitation(newInvitation);

    // Отправляем email
    const baseUrl = await getPublicBaseUrl();
    const emailSent = await emailService.sendClubInvitation({
      email: oldInvitation.email,
      clubName: access.club.title,
      clubDescription: access.club.description || 'Присоединяйтесь к нашему клубу!',
      inviterName: req.user.username,
      inviteToken,
      expiresAt,
      baseUrl,
    });

    if (!emailSent) {
      console.warn(`[Clubs] Email invitation not sent to ${oldInvitation.email} - SMTP may not be configured`);
    }

    logger.info(`[Clubs] Invitation resent to ${oldInvitation.email} for club "${access.club.title}" by ${req.user.username}`);

    res.status(201).json({
      message: emailSent 
        ? 'Invitation resent successfully' 
        : 'Invitation recreated but email not sent (SMTP not configured)',
      invitation: {
        id: createdInvitation.id,
        email: createdInvitation.email,
        status: createdInvitation.status,
        expiresAt: createdInvitation.expiresAt,
        emailSent,
      }
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ message: 'Failed to resend invitation' });
  }
});

export default router;
