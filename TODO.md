## Feature: Per-client usage tracking & users list on `/admin/clients/:id`

- [x] **DB: Add per-client usage summary helper**
  - Add a new SQL function (e.g. `get_client_usage_cost_summary`) that aggregates `execution.total_cost` / count / average cost, filtered by `client_id` and a `[from, to]` window, mirroring `get_usage_cost_summary` but scoped to a single client.
  - Ensure the function returns `total_cost`, `execution_count`, `average_cost`, and `currency`, and reuses existing `execution` cost columns and indexes where possible.

- [x] **Data layer: Extend `ClientDetail` with usage + users**
  - In `lib/admin/clients/data.ts`, introduce a small TS type for the per-client usage summary (matching the new RPC) and add a `usage` field to `ClientDetail` (e.g. `{ totalCost, averageCost, executionCount, currency } | null`).
  - In `getClientDetail`, compute a lookback window (e.g. last 30 days) and call the new Supabase RPC for the given `clientId`, adding the result to the existing `Promise.all` block and error handling.
  - Also in `getClientDetail`, query `user_profile` rows where `client_id = clientId`, selecting at least `id`, `email`, and `role`, sorted by `email`, and add a `users` array to `ClientDetail` containing those records.

- [x] **Admin client detail UI: Display usage summary**
  - In `app/admin/clients/[id]/page.tsx`, destructure the new `usage` field from `detail` and import the existing `formatCostAmount` helper used in the admin overview.
  - Add a new card in the metrics column (next to executions/success rate/assigned workflows) showing per-client usage for the chosen lookback window (total cost as the main value, with executions and average cost as secondary text when available; show a neutral placeholder when no data).

- [x] **Admin client detail UI: Display users under the client**
  - In `app/admin/clients/[id]/page.tsx`, destructure the new `users` array from `detail`.
  - Add a new `Card` section (e.g. “Users”) listing all users mapped to this client in a simple table with at least Email and Role columns, plus an empty state when there are no users.
  - Optionally, include a convenience link from this card to `/admin/users` (for editing roles/mappings) if it improves the workflow.

- [x] **Validation & polish**
  - Manually verify that `/admin/clients/:id` loads without errors for clients with and without executions, and with zero, one, and many users.
  - Confirm that global overview usage and existing client metrics remain unchanged, and that the new per-client usage numbers align with totals visible on the executions list for that client.

## Feature: Workflow-level usage breakdown per client

- [x] **DB: Add per-client workflow usage helper**
  - Create a SQL function (e.g. `get_client_workflow_usage_breakdown`) that mirrors `get_workflow_usage_breakdown` but filters by `client_id` and accepts a `p_limit` plus time window inputs.
  - Return `workflow_id`, `workflow_name`, `total_cost`, `execution_count`, `average_cost`, and `currency`, ordered by total cost descending.

- [x] **Data layer: Fetch and expose workflow breakdown**
  - Add a `workflowUsage` field to `ClientDetail` (array of `{ id, name, totalCost, executions, averageCost, currency }`).
  - In `getClientDetail`, call the new RPC with the same lookback window used for the per-client usage summary, and normalize the rows into UI-friendly types.

- [x] **UI: Render workflow usage table**
  - On `/admin/clients/:id`, add a new card (e.g. “Workflow usage”) displaying the breakdown in a table (columns: Workflow, Executions, Total cost, Average cost) and an empty state when there’s no data.
  - Reuse `formatCostAmount` / integer formatter for consistency and optionally include the same range label used in the summary.

- [ ] **Validation**
  - Manually test with a client that has multiple workflows to ensure the breakdown matches the executions view, and with a client that has none to confirm the empty state.
