import { v } from "convex/values";

// Collocations grouped by category
export const collocationsField = v.optional(v.object({
  commonCollocations: v.optional(v.array(v.object({
    phrase: v.string(),
    example: v.string(),
  }))),
  contexts: v.optional(v.array(v.object({
    phrase: v.string(),
    example: v.string(),
  }))),
  usagePatterns: v.optional(v.array(v.object({
    phrase: v.string(),
    example: v.string(),
  }))),
}));
