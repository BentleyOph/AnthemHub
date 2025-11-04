## Fix: Type mismatch for `sort` in executions API and UI

Date: 2025-11-04

### Summary

TypeScript failed to compile due to a type mismatch when passing query params to `normalizeExecutionListParams`. The `sort` field was inferred as `string | undefined`, but `normalizeExecutionListParams` (typed from a Zod schema) expects `sort?: "started_at.desc" | "started_at.asc" | "duration.desc" | "duration.asc" | undefined`.

Error excerpt:

> Argument of type '{ ... sort: string | undefined }' is not assignable to parameter of type '{ ... sort?: "started_at.desc" | "started_at.asc" | "duration.desc" | "duration.asc" | undefined }'.

### Root Cause

- The parameter type of `normalizeExecutionListParams` is derived from `z.input<typeof executionListSchema>`. Because the schema defines `sort` as `z.enum(EXECUTION_SORT_OPTIONS).default("started_at.desc")`, the input type for `sort` is a narrow string union (or `undefined`).
- Call sites were constructing an object from URLSearchParams where `sort` was typed as `string | undefined`. Even though the object literal used `satisfies Record<string, unknown>`, TypeScript still checks structural compatibility for each known property, and `string | undefined` is not assignable to the required union type.

### What Changed

1. Introduced a small type guard (exported for reuse) to enable narrowing when desired:
   - `lib/admin/executions/data.ts`: `export function isExecutionSort(value: unknown): value is ExecutionSort`

2. Updated call sites to satisfy the expected input type while preserving Zod runtime validation behavior:
   - `app/api/executions/route.ts:18` — Cast the `sort` query param to `ExecutionSort | undefined` when building the `raw` params object passed to `normalizeExecutionListParams`.
   - `lib/admin/executions/data.ts:472` — In `parseExecutionListSearchParams`, cast the `sort` value to `ExecutionSort | undefined` before passing to `normalizeExecutionListParams`.

   These casts are intentional. They align the compile-time type with the schema’s expected input type and allow Zod to continue performing runtime validation. Invalid `sort` values are still rejected by Zod (resulting in a 400 in the API, and an error UI on the page), while `undefined` continues to trigger the schema’s default of `"started_at.desc"`.

### Verification Steps

- Rebuild or run type-check:
  - `npm run build` or `npm run typecheck` (depending on project scripts).
  - Confirm no TypeScript errors are emitted for the affected files.

- Behavior checks:
  - API: Request `/api/executions?sort=duration.asc` responds normally; `/api/executions?sort=bogus` returns a 400 with validation details.
  - UI: Visiting the Executions page without a `sort` param applies the default; using a valid value sorts correctly; using an invalid value shows the “Invalid filters” notice.

### Notes

- Using `satisfies Record<string, unknown>` on an object literal does not prevent TypeScript from validating property types against the target function’s parameter type; the mismatch must be resolved per-property (as with `sort`).
- The exported `isExecutionSort` helper is available if future call sites prefer runtime narrowing over direct casting.

## Fix: API start route `unknown` assignment and global TypeScript errors

Date: 2025-11-04

### Summary

Resolving Next.js compile error in `app/api/executions/start/route.ts` where `result.data` (type `unknown`) was assigned to a variable inferred as `{}`; also cleaned up all outstanding TypeScript errors across the repository when running `tsc`.

### Root Causes & Fixes

- Start route input parsing
  - Root cause: `let parsedInput = payload.input ?? {}` inferred as `{}`, making `parsedInput = result.data` invalid (`unknown` to `{}`).
  - Fix: Explicitly type `parsedInput` as `unknown`.
    - app/api/executions/start/route.ts:105 — `let parsedInput: unknown = payload.input ?? {}`.

- Workflow list query param narrowing
  - Root cause: Passing `string | undefined` to a Zod-derived union for `status`.
  - Fix: Narrow/cast to union accepted by `normalizeWorkflowListParams`.
    - app/api/workflows/route.ts:31 — cast to `"ALL" | "PUBLISHED" | "DRAFT" | undefined`.

- Admin executions UI filter state typing
  - Root cause: `toggleValue` widened `ExecutionStatus[]` to `string[]`, causing setState type mismatch.
  - Fix: Make `toggleValue` generic to preserve element type and update call sites.
    - components/admin/executions/executions-table.tsx:137–156

- Client executions table JSX type
  - Root cause: Using `JSX.Element` without global JSX namespace, causing “Cannot find namespace 'JSX'”.
  - Fix: Use `ReactNode` and import it as a type.
    - components/client/executions-table.tsx:24, 34–56

- Supabase relationship result typing (arrays vs objects)
  - Root cause: Supabase inferred nested relationship rows as arrays in generic response types; our mappers expected objects. This led to mapper parameter type incompatibilities and property access errors.
  - Fix: Avoid mid-chain `.returns<T>()` (blocks filters) and instead cast result payloads to strongly-typed row shapes right before mapping. Applied consistently across admin and client data loaders.
    - lib/admin/executions/data.ts:276–292, 350–366, 399–407
    - lib/admin/access-requests/data.ts:200–214
    - lib/admin/clients/data.ts:426–449 and associated query blocks
    - lib/client/executions.ts:126–152
    - lib/client/overview.ts:290, 332–346
    - lib/client/workflows.ts:65–72, 120–144

- Zod v4 compatibility improvements
  - Root cause: Several Zod API signatures and type behaviors differ in v4.
  - Fixes:
    - Ensure `z.union` source is a non-empty tuple; add guards and safe casts.
    - Use `.int()` instead of `.transform(...)` for integer coercion to preserve number schema type.
    - `jsonSchemaDefaultValues` now returns `Record<string, unknown>` explicitly to align with consumers.
    - `z.record` called with explicit key/value schemas.
    - Files:
      - lib/schema/jsonschema-zod.ts: buildEnumSchema and number schema branch
      - lib/admin/workflows/data.ts:72

- Queue monitor event typing
  - Root cause: Listening to worker/queue events via `Queue.on(...)` using keys typed for `QueueEvents`.
  - Fix: Switch to `QueueEvents` for event subscriptions with proper types.
    - scripts/monitor-queue.ts: imports and event handlers

### Verification

- Ran `node_modules/.bin/tsc --noEmit` — zero errors.
- Validated the original failing route compiles.
- Behavior preserved:
  - Invalid inputs still trigger Zod validation and return structured 4xx responses.
  - Supabase queries unchanged at runtime; mapping now uses typed casts just before use.

### Notes

- The casts on Supabase results are localized to mapping points to reconcile type inference with relationship shapes. They do not alter runtime behavior and keep filter/sort chaining intact.
- For future stricter typing, consider PostgREST `select` helpers or codegen to generate accurate types for nested relations.
