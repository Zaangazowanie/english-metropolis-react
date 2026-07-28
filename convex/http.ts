// Public HTTP endpoints for external integrations.
//
// Currently used by:
// 1. The local PDF folder watcher on Bob's Windows machine — POSTs a
//    new notes PDF to /ingest/pdf with a shared-secret header.
// 2. The Tactiq → Google Drive bridge (future) — POSTs a transcript
//    to /ingest/tactiq.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { p24Config, p24NotificationSign, verifyAtP24 } from "./p24";

const http = httpRouter();

// Przelewy24 successful-payment notification. A valid checksum is necessary
// but not sufficient: amounts and merchant IDs must match our stored payment,
// then P24's transaction/verify endpoint must accept the transaction before
// lessons are allocated.
http.route({
  path: "/p24/status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body: any = await req.json();
      const cfg = p24Config();
      const requiredIntegers = ["merchantId", "posId", "amount", "originAmount", "orderId", "methodId"];
      if (
        !body ||
        typeof body.sessionId !== "string" ||
        typeof body.currency !== "string" ||
        typeof body.statement !== "string" ||
        typeof body.sign !== "string" ||
        requiredIntegers.some(key => !Number.isSafeInteger(body[key]))
      ) {
        return new Response("invalid notification", { status: 400 });
      }
      if (body.merchantId !== cfg.merchantId || body.posId !== cfg.posId) {
        return new Response("merchant mismatch", { status: 403 });
      }

      const expectedSign = await p24NotificationSign(body, cfg.crc);
      if (body.sign.toLowerCase() !== expectedSign) {
        return new Response("invalid signature", { status: 403 });
      }
      const payment: any = await ctx.runQuery(internal.p24.getPaymentForWebhook, {
        sessionId: body.sessionId,
      });
      if (!payment) return new Response("payment not found", { status: 404 });
      if (
        payment.amount !== body.amount ||
        payment.amount !== body.originAmount ||
        payment.currency !== body.currency
      ) {
        return new Response("payment details mismatch", { status: 409 });
      }
      if (payment.status === "paid") {
        return Response.json({ ok: true, alreadyPaid: true });
      }

      await verifyAtP24(body);
      const result = await ctx.runMutation(internal.p24.finalizePaid, {
        sessionId: body.sessionId,
        p24OrderId: body.orderId,
        methodId: body.methodId,
        statement: body.statement.slice(0, 250),
      });
      return Response.json(result);
    } catch (error: any) {
      console.error("P24 status error:", String(error?.message || error).slice(0, 700));
      return new Response("verification failed", { status: 502 });
    }
  }),
});

// Shared-secret auth. The watcher and the Drive bridge supply
// X-Ingest-Token: <secret>. The secret must match the Convex env
// variable INGEST_API_TOKEN which the superadmin sets once during
// deploy (see SUPERADMIN-HANDOFF.md).
function requireToken(req: Request): string | null {
  const expected = process.env.INGEST_API_TOKEN;
  if (!expected) return "INGEST_API_TOKEN not configured on server";
  const supplied = req.headers.get("x-ingest-token") || "";
  if (supplied !== expected) return "invalid or missing X-Ingest-Token header";
  return null;
}

// POST /ingest/pdf
// Multipart form with:
//   file: the PDF file
//   organization: "conversa" | "englishline" (derived from the
//     watched folder name so the watcher tags each upload)
//   filename: original filename (for correlation + audit)
http.route({
  path: "/ingest/pdf",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authError = requireToken(req);
    if (authError) {
      return new Response(authError, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const organizationSlug = String(form.get("organization") ?? "");
    const filename = String(form.get("filename") ?? "unknown.pdf");

    if (!(file instanceof Blob)) {
      return new Response("missing 'file' field", { status: 400 });
    }

    // Store the PDF in Convex storage.
    const notesStorageId = await ctx.storage.store(file);

    // Resolve the organization by slug so the job is tagged correctly.
    const org: { _id: any } | null = organizationSlug
      ? await ctx.runQuery(internal.ingestion.getOrgBySlugInternal, {
          slug: organizationSlug,
        })
      : null;

    // Create the ingestion job (without a superadmin user — this is
    // system-initiated, so createdByUserId is undefined).
    const { jobId } = await ctx.runMutation(
      internal.ingestion.createSystemIngestionJob,
      {
        sourceKind: "pdf_watcher",
        organizationId: org?._id,
        notesStorageId,
        sourceFilename: filename,
      },
    );

    return new Response(
      JSON.stringify({ ok: true, jobId, storageId: notesStorageId }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }),
});

// POST /ingest/tactiq
// Same auth. Body is either a JSON blob { transcript, studentSlug, date }
// or a multipart form with file=<transcript.txt>.
http.route({
  path: "/ingest/tactiq",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authError = requireToken(req);
    if (authError) return new Response(authError, { status: 401 });

    const contentType = req.headers.get("content-type") || "";
    let transcriptText: string | undefined;
    let transcriptStorageId: any | undefined;
    let sourceFilename: string | undefined;
    let organizationSlug: string | undefined;
    let detectedDate: string | undefined;
    let detectedStudentSlug: string | undefined;
    let notesText: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      sourceFilename = String(form.get("filename") ?? "tactiq.txt");
      organizationSlug = form.get("organization")?.toString();
      detectedDate = form.get("date")?.toString();
      detectedStudentSlug = form.get("studentSlug")?.toString();
      notesText = form.get("notesText")?.toString();
      if (file instanceof Blob) {
        transcriptStorageId = await ctx.storage.store(file);
      } else if (typeof file === "string") {
        transcriptText = file;
      }
    } else {
      const body = await req.json();
      transcriptText = body.transcript;
      sourceFilename = body.filename;
      organizationSlug = body.organization;
      detectedDate = body.date;
      detectedStudentSlug = body.studentSlug;
      notesText = body.notesText;
    }

    if (!transcriptText && !transcriptStorageId) {
      return new Response("missing transcript", { status: 400 });
    }

    const org: { _id: any } | null = organizationSlug
      ? await ctx.runQuery(internal.ingestion.getOrgBySlugInternal, {
          slug: organizationSlug,
        })
      : null;

    let detectedStudentId: any | undefined;
    if (detectedStudentSlug) {
      const student = await ctx.runQuery(
        internal.ingestion.getStudentBySlugInternal,
        { slug: detectedStudentSlug },
      );
      detectedStudentId = student?._id;
    }

    const { jobId } = await ctx.runMutation(
      internal.ingestion.createSystemIngestionJob,
      {
        sourceKind: "tactiq_drive",
        organizationId: org?._id,
        transcriptText,
        transcriptStorageId,
        sourceFilename,
        detectedDate,
        detectedStudentId,
      },
    );

    // Forward notesText if supplied — createSystemIngestionJob only
    // accepts notesStorageId so we patch it in a second mutation.
    if (notesText) {
      await ctx.runMutation(internal.ingestion.patchNotes, {
        jobId,
        notesText,
      });
    }

    return new Response(JSON.stringify({ ok: true, jobId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
