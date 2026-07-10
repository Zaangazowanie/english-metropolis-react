/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as authHelpers from "../authHelpers.js";
import type * as bajla from "../bajla.js";
import type * as billing from "../billing.js";
import type * as consoleTeacher from "../consoleTeacher.js";
import type * as crons from "../crons.js";
import type * as curriculum from "../curriculum.js";
import type * as exerciseGroups from "../exerciseGroups.js";
import type * as exposure from "../exposure.js";
import type * as googleAuth from "../googleAuth.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as ingestionFewShots from "../ingestionFewShots.js";
import type * as ingestionProcess from "../ingestionProcess.js";
import type * as ingestionPrompts from "../ingestionPrompts.js";
import type * as orders from "../orders.js";
import type * as practice from "../practice.js";
import type * as scheduling from "../scheduling.js";
import type * as search from "../search.js";
import type * as sentenceFreshness from "../sentenceFreshness.js";
import type * as studentAuth from "../studentAuth.js";
import type * as students from "../students.js";
import type * as teacherAuth from "../teacherAuth.js";
import type * as teachers from "../teachers.js";
import type * as validators from "../validators.js";
import type * as zestaw from "../zestaw.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  authHelpers: typeof authHelpers;
  bajla: typeof bajla;
  billing: typeof billing;
  consoleTeacher: typeof consoleTeacher;
  crons: typeof crons;
  curriculum: typeof curriculum;
  exerciseGroups: typeof exerciseGroups;
  exposure: typeof exposure;
  googleAuth: typeof googleAuth;
  groups: typeof groups;
  http: typeof http;
  ingestion: typeof ingestion;
  ingestionFewShots: typeof ingestionFewShots;
  ingestionProcess: typeof ingestionProcess;
  ingestionPrompts: typeof ingestionPrompts;
  orders: typeof orders;
  practice: typeof practice;
  scheduling: typeof scheduling;
  search: typeof search;
  sentenceFreshness: typeof sentenceFreshness;
  studentAuth: typeof studentAuth;
  students: typeof students;
  teacherAuth: typeof teacherAuth;
  teachers: typeof teachers;
  validators: typeof validators;
  zestaw: typeof zestaw;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
