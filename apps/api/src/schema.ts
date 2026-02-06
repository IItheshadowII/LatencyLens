import { z } from "zod";

export const pingSchema = z.object({
  samples: z.array(z.number()),
  timeouts: z.number().int().nonnegative(),
  avg: z.number().nullable(),
  median: z.number().nullable(),
  p95: z.number().nullable(),
  jitter: z.number().nullable(),
  loss: z.number().min(0).max(1)
});

export const throughputSchema = z.object({
  bytes: z.number().int().positive(),
  seconds: z.number().nonnegative(),
  mbps: z.number().nullable()
});

export const resultSchema = z.object({
  cloud: z.string().url(),
  timestamp: z.string(),
  userAgent: z.string(),
  screen: z.string(),
  ip: z.string().optional(),
  ping: pingSchema,
  download: throughputSchema,
  upload: throughputSchema,
  classification: z.enum(["VERDE", "AMARILLO", "ROJO"])
});

export type ResultPayload = z.infer<typeof resultSchema>;
