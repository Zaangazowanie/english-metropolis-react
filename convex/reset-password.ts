import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const resetAdminPassword = mutation({
  args: { email: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { password: args.newPassword, updatedAt: Date.now() });
    return { success: true };
  },
});
