import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const login = query({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.students.getUserByEmail, { email: args.email });

    if (!user || user.password !== args.password) {
      return {
        success: false,
        error: "Invalid credentials",
      };
    }

    const { password, ...safeUser } = user;

    return {
      success: true,
      user: safeUser,
    };
  },
});

// Wipe all data from all tables (for reimport). Use with caution!
export const wipeAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "keywords",
      "lessons",
      "students",
      "transcriptAnalyses",
      "quizResults",
      "youglishIndex",
      "keywordBank",
      "ttsCache",
    ] as const;

    let total = 0;
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        total++;
      }
    }
    return { deleted: total };
  },
});
