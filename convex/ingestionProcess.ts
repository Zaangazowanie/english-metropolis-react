"use node";

// ─────────────────────────────────────────────────────────────────────
// Node-runtime action — multi-provider LLM ingestion processor.
// Currently supports:
//   - GLM-5 Turbo via OpenAI-compat at api.z.ai (env: GLM_API_KEY)
//   - MiniMax M2.7 via Anthropic-compat at api.minimax.io (env: MINIMAX_API_KEY)
//   - Qwen 3.5 Plus via OpenAI-compat at opencode.ai/zen/go (env: OPENCODE_API_KEY)
// Provider selection: round-robin across available providers using
// retryCount % N for automatic failover.
// ─────────────────────────────────────────────────────────────────────

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  buildAnalysisPrompt,
  buildKeywordsPrompt,
  buildZestawMustInclude,
  MODEL_ANALYSIS,
  MODEL_KEYWORDS,
} from "./ingestionPrompts";
import { ANALYSIS_FEW_SHOTS, KEYWORD_FEW_SHOTS } from "./ingestionFewShots";

type LLMResult = { text: string; inputTokens: number; outputTokens: number };

// ── GLM-5 Turbo (OpenAI-compatible) ─────────────────────────────────
async function callGLM(opts: {
  apiKey: string; model: string; maxTokens: number;
  system: string; userText: string;
}): Promise<LLMResult> {
  const res = await fetch(
    "https://api.z.ai/api/coding/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userText },
        ],
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GLM ${res.status}: ${t.slice(0, 500)}`);
  }
  const data: any = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ── MiniMax M2.7 (Anthropic-compatible) ─────────────────────────────
async function callMinimax(opts: {
  apiKey: string; model: string; maxTokens: number;
  system: string; userText: string;
}): Promise<LLMResult> {
  const res = await fetch(
    "https://api.minimax.io/anthropic/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.userText }],
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Minimax ${res.status}: ${t.slice(0, 500)}`);
  }
  const data: any = await res.json();
  const text = (data.content || [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ── Qwen 3.5 Plus via OpenCode Go (OpenAI-compatible) ───────────────
async function callOpenCode(opts: {
  apiKey: string; model: string; maxTokens: number;
  system: string; userText: string;
}): Promise<LLMResult> {
  const res = await fetch(
    "https://opencode.ai/zen/go/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userText },
        ],
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenCode ${res.status}: ${t.slice(0, 500)}`);
  }
  const data: any = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ── Provider dispatcher — round-robin across available providers ────
async function callLLM(opts: {
  glmKey: string; minimaxKey: string; opencodeKey: string;
  model: string; maxTokens: number; system: string; userText: string;
  retryCount: number;
}): Promise<LLMResult & { provider: string }> {
  type Provider = { name: string; fn: () => Promise<LLMResult> };
  const providers: Provider[] = [];
  if (opts.glmKey) {
    providers.push({
      name: "glm-5-turbo",
      fn: () => callGLM({ ...opts, apiKey: opts.glmKey }),
    });
  }
  if (opts.minimaxKey) {
    providers.push({
      name: "MiniMax-M2.7",
      fn: () => callMinimax({ ...opts, apiKey: opts.minimaxKey, model: "MiniMax-M2.7" }),
    });
  }
  if (opts.opencodeKey) {
    providers.push({
      name: "qwen3.5-plus",
      fn: () => callOpenCode({ ...opts, apiKey: opts.opencodeKey, model: "qwen3.5-plus" }),
    });
  }
  if (!providers.length) {
    throw new Error("No LLM API keys configured");
  }
  const idx = opts.retryCount % providers.length;
  const chosen = providers[idx];
  const r = await chosen.fn();
  return { ...r, provider: chosen.name };
}

export const processJobInternal = internalAction({
  args: { jobId: v.id("ingestionJobs") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.ingestion.markProcessing, {
      jobId: args.jobId,
    });

    try {
      const loaded = await ctx.runQuery(
        internal.ingestion.loadJobForProcessing,
        { jobId: args.jobId },
      );
      if (!loaded || !loaded.job) {
        throw new Error("Job not found during processing");
      }
      const { job, transcriptUrl, notesUrl, student } = loaded;

      // ── Assemble inputs ───────────────────────────────────────────
      let transcriptText: string = job.transcriptText ?? "";
      if (!transcriptText && transcriptUrl) {
        const res = await fetch(transcriptUrl);
        if (!res.ok) throw new Error(`transcript fetch failed: ${res.status}`);
        transcriptText = await res.text();
      }
      if (!transcriptText || transcriptText.length < 200) {
        throw new Error(
          "Transcript is empty or too short (< 200 chars). Upload a real transcript.",
        );
      }

      let notesText: string = job.notesText ?? "";
      if (notesUrl && !notesText) {
        const res = await fetch(notesUrl);
        if (!res.ok) throw new Error(`notes fetch failed: ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        const lowerName = (job.sourceFilename || "").toLowerCase();
        if (ct.includes("pdf") || lowerName.endsWith(".pdf")) {
          throw new Error(
            "Raw PDF notes cannot be processed in the Convex runtime (no DOM APIs for pdfjs). Pre-extract the PDF to text client-side and resubmit with notesText populated.",
          );
        }
        notesText = await res.text();
      }

      const glmKey = process.env.GLM_API_KEY ?? "";
      const minimaxKey = process.env.MINIMAX_API_KEY ?? "";
      const opencodeKey = process.env.OPENCODE_API_KEY ?? "";
      if (!glmKey && !minimaxKey && !opencodeKey) {
        throw new Error(
          "No LLM keys set. Set at least one of: GLM_API_KEY, MINIMAX_API_KEY, OPENCODE_API_KEY",
        );
      }
      const retryCount = job.retryCount ?? 0;

      const studentContext = student
        ? `Student: ${student.name} (slug: ${student.slug})
Current CEFR level: ${student.level}
Target CEFR level: ${student.targetLevel ?? "unspecified"}
Native language: ${student.nativeLanguage ?? "pl"}
Lesson date: ${job.detectedDate ?? "unknown"}`
        : `Student: unknown (to be detected from transcript)
Lesson date: ${job.detectedDate ?? "unknown"}`;

      const notesSuffix = notesText
        ? `\n\nTEACHER NOTES:\n${notesText}`
        : "";

      // ── Zestaw lookup ──────────────────────────────────────────
      // Resolve the authoritative panel-scraped keyword list for
      // this student's course + date. If found, attach to the job
      // so the review UI can surface it, and prepend a MUST_INCLUDE
      // block to the keyword prompt.
      let zestawBlock = "";
      try {
        const zestaw = await ctx.runQuery(internal.zestaw.resolveForJob, {
          studentId: job.detectedStudentId,
          detectedDate: job.detectedDate,
        });
        if (zestaw && zestaw.keywords.length > 0) {
          await ctx.runMutation(internal.zestaw.attachZestawToJob, {
            jobId: args.jobId,
            zestawSid: zestaw.sid,
            zestawLessonTitle: zestaw.lessonTitle,
            zestawKeywords: zestaw.keywords.map((k) => ({
              word: k.word,
              translation: k.translation,
              exampleEn: k.exampleEn,
              nr: k.nr,
            })),
          });
          zestawBlock = buildZestawMustInclude(
            zestaw.lessonTitle,
            zestaw.keywords,
          );
        }
      } catch (e) {
        console.warn("zestaw resolve failed (non-fatal):", e);
      }

      // ── Analysis call ──────────────────────────────────────────
      const analysisSystem = buildAnalysisPrompt(ANALYSIS_FEW_SHOTS);
      const analysisUser = `LESSON CONTEXT:\n${studentContext}\n\nTRANSCRIPT (raw, possibly from Tactiq/Google Meet):\n\n${transcriptText}${notesSuffix}`;
      const analysisCall = await callLLM({
        glmKey, minimaxKey, opencodeKey, retryCount,
        model: MODEL_ANALYSIS,
        maxTokens: 16000,
        system: analysisSystem,
        userText: analysisUser,
      });
      const stagedAnalysis = parseAnalysis(analysisCall.text);

      // ── Keywords call ─────────────────────────────────────────
      const keywordsSystem = buildKeywordsPrompt(
        KEYWORD_FEW_SHOTS,
        zestawBlock,
      );
      const keywordsUser = `LESSON CONTEXT:\n${studentContext}\n\nTRANSCRIPT:\n\n${transcriptText}${notesSuffix}`;
      const keywordsCall = await callLLM({
        glmKey, minimaxKey, opencodeKey, retryCount,
        model: MODEL_KEYWORDS,
        maxTokens: 32000,
        system: keywordsSystem,
        userText: keywordsUser,
      });
      const stagedKeywords = parseKeywords(keywordsCall.text);

      const inputTokens = analysisCall.inputTokens + keywordsCall.inputTokens;
      const outputTokens = analysisCall.outputTokens + keywordsCall.outputTokens;

      const detectedTitle =
        job.detectedTitle || deriveTitleFromSummary(stagedAnalysis.lessonSummary);
      const detectedTopics = deriveTopics(stagedAnalysis);

      await ctx.runMutation(internal.ingestion.writeStagedOutput, {
        jobId: args.jobId,
        stagedAnalysis,
        stagedKeywords,
        detectedTitle,
        detectedTopics,
        inputTokens,
        outputTokens,
      });
    } catch (err: any) {
      console.error("Ingestion job failed:", err);
      await ctx.runMutation(internal.ingestion.markFailed, {
        jobId: args.jobId,
        error: err?.message ?? String(err),
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────
// Parsing helpers (Node-side copy; kept here to avoid cross-file
// imports of helper utilities between V8 and Node runtimes)
// ─────────────────────────────────────────────────────────────────────

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/, "");
    t = t.replace(/```\s*$/, "");
  }
  return t.trim();
}

function repairJson(raw: string): string {
  let s = raw;
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");
  // Fix unescaped newlines inside JSON string values
  s = s.replace(/(?<=":[\s]*"[^"]*)\n(?=[^"]*")/g, "\\n");
  // Fix single-escaped backslashes that break JSON (e.g. \' → ')
  s = s.replace(/\\'/g, "'");
  // Fix control chars
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
  return s;
}

function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = repairJson(raw);
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function parseAnalysis(text: string): any {
  const cleaned = stripJsonFence(text);
  let parsed = safeJsonParse(cleaned);
  if (!parsed) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Analysis response is not valid JSON");
    parsed = safeJsonParse(match[0]);
    if (!parsed) throw new Error("Analysis JSON repair failed");
  }
  const num = (k: string) => {
    const v = Number(parsed[k]);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
  };
  return {
    vocabularyRange: num("vocabularyRange"),
    grammaticalAccuracy: num("grammaticalAccuracy"),
    fluencyAndCoherence: num("fluencyAndCoherence"),
    pronunciation: num("pronunciation"),
    communicativeEffectiveness: num("communicativeEffectiveness"),
    overallScore: num("overallScore"),
    cefrBand: String(parsed.cefrBand ?? "B1"),
    lessonSummary: String(parsed.lessonSummary ?? ""),
    strengths: toStringArray(parsed.strengths),
    improvements: toStringArray(parsed.improvements),
    keyErrors: toKeyErrorArray(parsed.keyErrors),
    personalDetails: toStringArray(parsed.personalDetails),
    practiceAdvice: toStringArray(parsed.practiceAdvice),
  };
}

function parseKeywords(text: string): any[] {
  const cleaned = stripJsonFence(text);
  let parsed = safeJsonParse(cleaned);
  if (!parsed) {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Keywords response is not a JSON array");
    parsed = safeJsonParse(match[0]);
    if (!parsed) throw new Error("Keywords JSON repair failed");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Keywords response is not an array");
  }
  return parsed
    .filter((k: any) => k && typeof k === "object" && k.word)
    .map((k: any) => ({
      word: String(k.word ?? "").trim(),
      translation: String(k.translation ?? "").trim(),
      definitionEn: String(k.definitionEn ?? "").trim(),
      definitionPl: String(k.definitionPl ?? "").trim(),
      exampleEn: String(k.exampleEn ?? "").trim(),
      examplePl: String(k.examplePl ?? "").trim(),
      ipa: sanitizeIpa(String(k.ipa ?? "")),
      stressUK: String(k.stressUK ?? "").trim(),
      stressUS: String(k.stressUS ?? k.stressUK ?? "").trim(),
      topics: toStringArray(k.topics),
      wordType: k.wordType ? String(k.wordType) : undefined,
      difficulty: k.difficulty ? String(k.difficulty) : undefined,
      collocations: normaliseCollocations(k.collocations),
    }));
}

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) => String(x)).filter(Boolean);
}

function toKeyErrorArray(
  v: any,
): Array<{ error: string; correction: string; category: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x: any) => x && typeof x === "object")
    .map((x: any) => ({
      error: String(x.error ?? ""),
      correction: String(x.correction ?? ""),
      category: String(x.category ?? "grammar"),
    }));
}

function normaliseCollocations(v: any): any {
  if (!v || typeof v !== "object") return undefined;
  const mkArr = (items: any) => {
    if (!Array.isArray(items)) return undefined;
    return items
      .filter((i: any) => i && typeof i === "object" && i.phrase)
      .map((i: any) => ({
        phrase: String(i.phrase),
        example: String(i.example ?? ""),
      }));
  };
  return {
    commonCollocations: mkArr(v.commonCollocations),
    contexts: mkArr(v.contexts),
    usagePatterns: mkArr(v.usagePatterns),
  };
}

// Kimi sometimes wraps IPA in double slashes like //foo//; collapse to
// single /foo/ and strip any surrounding whitespace.
function sanitizeIpa(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const stripped = t.replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return stripped ? `/${stripped}/` : "";
}

function deriveTitleFromSummary(summary: string): string {
  const firstSentence = (summary || "").split(/[.!?]/)[0].trim();
  return firstSentence.slice(0, 70) || "Untitled lesson";
}

// Words that capitalise in mid-summary but are never a lesson topic:
// sentence-starters, pronouns, months, weekdays, nationalities,
// and the filler "General"/"English" pair the fallback already supplies.
const TOPIC_STOP = new Set([
  "The","This","That","These","Those","A","An","He","She","It","They",
  "We","I","His","Her","Their","Our","My","Your",
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
  "January","February","March","April","May","June","July","August",
  "September","October","November","December",
  "Polish","English","Poland","England","Britain","British","American",
  "Russian","Ukrainian","Chinese","Japanese","German","French","Spanish",
  "Italian","European","Europe","Asia","Asian","Africa","African",
  "Mike","Michael","Michael Poncana",
  "General","General English",
  "Lesson","Lessons","Today","Yesterday","Tomorrow",
]);

function deriveTopics(analysis: any): string[] {
  const text = String(analysis.lessonSummary || "");
  const matches =
    text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) || [];
  const filtered = matches.filter((m) => {
    if (TOPIC_STOP.has(m)) return false;
    // Drop multi-word phrases whose first token is a stopword (e.g.
    // "The Oracle", "He Explained") and single-token capitalised
    // fragments shorter than 4 chars ("Gen", "It", "Zi").
    const first = m.split(/\s+/)[0];
    if (TOPIC_STOP.has(first)) return false;
    if (!m.includes(" ") && m.length < 4) return false;
    return true;
  });
  const uniq = [...new Set(filtered)].slice(0, 5);
  return uniq.length > 0 ? uniq : ["General English"];
}
