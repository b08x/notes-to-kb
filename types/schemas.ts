import { z } from "zod";

// CORE-002: Raw Node Zod Schemas
export const RawNodeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    id: z.string().uuid(),
    content: z.string(),
    metadata: z.object({
      source_page: z.number().optional(),
      confidence_score: z.number().optional(),
      bounding_box: z.array(z.number()).optional(),
    }),
  }),
  z.object({
    type: z.literal("image"),
    id: z.string().uuid(),
    content: z.string(), // Base64
    metadata: z.object({
      source_page: z.number().optional(),
      confidence_score: z.number().optional(),
      bounding_box: z.array(z.number()).optional(),
      caption: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("code_block"),
    id: z.string().uuid(),
    content: z.string(),
    metadata: z.object({
      language: z.string().optional(),
      source_page: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("table"),
    id: z.string().uuid(),
    content: z.string(), // HTML or JSON representation
    metadata: z.object({
      source_page: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("section_header"),
    id: z.string().uuid(),
    content: z.string(),
    metadata: z.object({
      level: z.number().min(1).max(6),
      source_page: z.number().optional(),
    }),
  }),
]);

export type RawNode = z.infer<typeof RawNodeSchema>;

// ServiceNow Article Schema
export const ServiceNowArticleSchema = z.object({
  number: z.string().optional(),
  short_description: z.string().describe("The Title of the KB Article"),
  text: z.string().describe("The main HTML body content"),
  resolution: z.string().optional(),
  cause: z.string().optional(),
  version: z.string().default("1.0"),
  metadata: z.object({
    generated_at: z.date().default(() => new Date()),
    model: z.string().optional(),
  }).optional()
});

export type ServiceNowArticle = z.infer<typeof ServiceNowArticleSchema>;