import express from 'express';
import { z } from 'zod';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import type { InsertGenre } from '../../../shared/schema.js';

type FullAdminMiddleware = express.RequestHandler;

interface AdminBookGenresRouterDeps {
  requireFullAdmin: FullAdminMiddleware;
}

const adminGenreUpsertSchema = z.object({
  code: z.string().trim().min(1).max(120),
  labelRu: z.string().trim().min(1),
  labelEn: z.string().trim().max(255).optional().nullable(),
  groupKey: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  aliases: z.array(z.string().trim().min(1)).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const adminGenreUpdateSchema = adminGenreUpsertSchema.omit({ code: true }).partial();
type AdminGenreUpdatePayload = z.infer<typeof adminGenreUpdateSchema>;

function buildGenreUpdatePayload(payload: AdminGenreUpdatePayload): Partial<InsertGenre> {
  const { aliases, ...genreFields } = payload;
  return {
    ...genreFields,
    ...(Array.isArray(aliases) ? { aliasesJson: JSON.stringify(aliases) } : {}),
  };
}


export function createAdminBookGenresRouter(deps: AdminBookGenresRouterDeps) {
  const router = express.Router();
  const { requireFullAdmin } = deps;

router.get('/genres', jwtAuth, requireAdmin, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const genres = await storage.getGenresAdmin(search);
  res.json(genres.map((genre) => ({
    id: genre.id,
    code: genre.code,
    labelRu: genre.labelRu,
    labelEn: genre.labelEn,
    groupKey: genre.groupKey,
    description: genre.description,
    aliases: genre.aliasesJson ? JSON.parse(genre.aliasesJson) : [],
    sortOrder: genre.sortOrder,
    isActive: genre.isActive,
    createdAt: genre.createdAt,
    updatedAt: genre.updatedAt,
  })));
});

router.post('/genres', jwtAuth, requireFullAdmin, async (req, res) => {
  const parsed = adminGenreUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid genre payload' });
  }

  const payload = parsed.data;
  const genre = await storage.createGenre({
    code: payload.code,
    labelRu: payload.labelRu,
    labelEn: payload.labelEn ?? null,
    groupKey: payload.groupKey ?? null,
    description: payload.description ?? null,
    aliasesJson: JSON.stringify(payload.aliases ?? []),
    sortOrder: payload.sortOrder ?? 0,
    isActive: payload.isActive ?? true,
  });

  res.json(genre);
});

router.put('/genres/:code', jwtAuth, requireFullAdmin, async (req, res) => {
  const parsed = adminGenreUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid genre payload' });
  }

  const updated = await storage.updateGenre(req.params.code, buildGenreUpdatePayload(parsed.data));

  if (!updated) {
    return res.status(404).json({ error: 'Genre not found' });
  }

  res.json(updated);
});

router.delete('/genres/:code', jwtAuth, requireFullAdmin, async (req, res) => {
  const deleted = await storage.deleteGenre(req.params.code);

  if (!deleted) {
    return res.status(404).json({ error: 'Genre not found' });
  }

  res.status(204).send();
});



  return router;
}
