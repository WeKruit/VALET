import { z } from "zod";

export const earlyAccessSubmitRequest = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().min(1, "Name is required").max(255),
  source: z.string().max(50).optional().default("landing_page"),
  referralCode: z.string().max(100).optional(),
});

export const earlyAccessSubmitResponse = z.object({
  message: z.string(),
  position: z.number().int().optional(),
});

export type EarlyAccessSubmitRequest = z.infer<typeof earlyAccessSubmitRequest>;
export type EarlyAccessSubmitResponse = z.infer<typeof earlyAccessSubmitResponse>;
