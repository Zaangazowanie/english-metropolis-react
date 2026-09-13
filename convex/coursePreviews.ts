import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireStudent } from "./authHelpers";
import type { Id } from "./_generated/dataModel";

// The session chooses the student. A slug or studentId supplied by a caller
// must never grant access to another student's course or private materials.
export const context = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const [group, plan, lessons] = await Promise.all([
      student.groupId ? ctx.db.get(student.groupId as Id<"groups">) : null,
      ctx.db.query("curriculumItems")
        .withIndex("by_student_position", q => q.eq("studentId", student._id)).collect(),
      ctx.db.query("lessons")
        .withIndex("by_student", q => q.eq("studentId", student._id)).collect(),
    ]);
    return {
      courseId: group?.courseId ?? null,
      plan: plan.map(p => ({
        id: String(p._id), position: p.position, title: p.title,
        topics: p.topics, keywords: p.keywords ?? [], status: p.status,
        lessonId: p.lessonId ?? null, pdfUrl: p.pdfUrl ?? null,
        level: p.targetCefr ?? null,
      })),
      lessons: lessons.map(l => ({ id: String(l._id), title: l.title, status: l.status ?? null })),
    };
  },
});
