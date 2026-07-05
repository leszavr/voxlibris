import express from 'express';
import { eq } from 'drizzle-orm';
import { jwtAuth } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import { db } from '../../db.js';
import { clubs } from '../../../shared/schema.js';
import { logger } from '../../lib/logger.js';
import { isReaderLedClub } from '../../lib/reader-club-access.js';

const router = express.Router();

/**
 * POST /api/clubs/:clubId/transfer-ownership
 * Передача прав владельца другому участнику
 */
router.post('/:clubId/transfer-ownership', jwtAuth, async (req, res) => {
  try {
    const { clubId } = req.params;
    const { newOwnerId } = req.body;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!newOwnerId) {
      return res.status(400).json({ message: 'New owner ID is required' });
    }

    // Проверяем права текущего пользователя
    const isAdmin = req.user?.role === 'admin';
    
    if (!isAdmin) {
      // Если не админ, проверяем что пользователь - владелец клуба
      const currentMember = await storage.getClubMembersWithRoles(clubId)
        .then(members => members.find(m => m.id === currentUserId));

      if (currentMember?.role !== 'owner') {
        return res.status(403).json({ message: 'Only club owner or admin can transfer ownership' });
      }
    }

    // Проверяем что новый владелец - участник клуба
    const newOwnerMember = await storage.getClubMembersWithRoles(clubId)
      .then(members => members.find(m => m.id === newOwnerId));

    if (!newOwnerMember) {
      return res.status(404).json({ message: 'New owner must be a club member' });
    }

    const clubBeforeTransfer = await storage.getClub(clubId);
    if (!clubBeforeTransfer) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (isReaderLedClub(clubBeforeTransfer)) {
      return res.status(403).json({
        message: 'Передача владения клубом чтецов не поддерживается: в клубе может быть только один чтец-владелец.',
        code: 'READER_LED_TRANSFER_OWNERSHIP_FORBIDDEN',
      });
    }

    if (newOwnerMember.id === currentUserId && !isAdmin) {
      return res.status(400).json({ message: 'Cannot transfer ownership to yourself' });
    }

    // Выполняем передачу прав
    // 1. Старый владелец становится обычным участником
    const oldOwners = await storage.getClubMembersWithRoles(clubId)
      .then(members => members.filter(m => m.role === 'owner'));
    
    for (const oldOwner of oldOwners) {
      await storage.updateMemberRole(clubId, oldOwner.id, 'member');
    }

    // 2. Новый участник становится владельцем
    await storage.updateMemberRole(clubId, newOwnerId, 'owner');

    // 3. Обновляем owner_id в таблице clubs напрямую через Drizzle
    await db
      .update(clubs)
      .set({ ownerId: newOwnerId })
      .where(eq(clubs.id, clubId));

    const club = await storage.getClub(clubId);
    
    logger.info(
      { clubId, oldOwnerId: currentUserId, newOwnerId, adminAction: isAdmin },
      '[Clubs] Ownership transferred'
    );

    res.json({
      message: 'Ownership transferred successfully',
      club,
      newOwnerId
    });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    res.status(500).json({ message: 'Failed to transfer ownership' });
  }
});

export default router;
