import { z } from 'zod';

/** Error body returned by every failing `/api` route. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** GET /api/health */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
