## TODO: Support file uploads in workflow run form

- [ ] Confirm `file-uploads` Supabase Storage bucket exists and is configured with policies that allow the browser client to upload objects and create 24-hour signed URLs for authenticated users.
- [ ] Decide on a max file size for uploaded workflow input files (e.g. 10–20 MB) and document the limit in the admin JSON schema description copy.
- [ ] Add a small note in the admin workflow editor docs/help (if any) to show the recommended JSON schema for file uploads, using a `string` field with `format: "uri"` (e.g. `file_url`) as in the example provided.

### Client-side storage helper

- [ ] Create a small client-side helper that wraps the Supabase browser client for storage uploads, using `getSupabaseBrowserClient` from `lib/supabase/client.ts`.
- [ ] In that helper, define a constant for the workflow input bucket name (defaulting to `"file-uploads"`) and a function that:
  - Accepts a `File` plus optional metadata.
  - Generates a unique object key (e.g. using `crypto.randomUUID()` + original extension).
  - Uploads the file to the `file-uploads` bucket via `storage.from(bucket).upload(...)`.
  - Immediately creates a signed URL for the uploaded path with a 7-days expiry (604,800 seconds).
  - Returns the signed URL string so it can be stored directly in the workflow input payload.
- [ ] Ensure the helper surfaces clear errors (e.g. invalid file type, size too large, Supabase errors) so the UI can show a toast and avoid setting a broken URL into the form state.

### Rendering a file input for `format: "uri"`

- [ ] Update `components/client/workflow-run-form.tsx` to treat JSON schema fields of type `string` with `format: "uri"` (or `format: "url"`) as file-upload fields instead of plain text inputs.
- [ ] In `ScalarField`, before the default string input branch, add a branch that detects `schema.format === "uri"`/`"url"` and renders a dedicated “file upload” field component for that path.
- [ ] The file-upload field should:
  - Render an `<input type="file">` (limited to PDF and CSV via `accept="application/pdf,.pdf,text/csv,.csv"`).
  - Show the current value (if any) as the resolved URL (read-only text or small link) so presets or previously submitted values still display meaningfully.
  - Show validation state and errors using the existing `Field`, `FieldLabel`, `FieldDescription`, and `FieldError` components.
- [ ] When a user selects a file:
  - Immediately call the client-side upload helper to send the file to Supabase Storage.
  - While uploading, disable the file input and show a lightweight “Uploading…” hint/spinner.
  - On success, set the corresponding form value for that schema path to the returned signed URL string via the existing `onChange`/`updateValue` plumbing.
  - On failure, leave the previous value intact, show a toast error, and allow the user to retry.

### Integration with form submission and validation

- [ ] Verify that the zod schema generated from JSON Schema (`jsonSchemaToZod`) already treats `format: "uri"` as a URL string, and confirm that the signed URLs produced by Supabase pass this validation.
- [ ] Ensure the workflow run payload submitted to `/api/executions/start` is unchanged structurally: for the `file_url` field, the value should simply be the signed URL string returned from Supabase.
- [ ] Double-check that no additional server-side changes are needed in the execution worker (`workers/exec-start.ts`): n8n should receive `input.file_url` as a URL and can then download the file with an HTTP Request node into binary memory.

### UX polishing and guardrails

- [ ] Add user-facing helper text on the file-upload field summarizing allowed types (PDF/CSV) and the fact that the underlying file is stored temporarily and referenced via a URL.
- [ ] Consider whether we need a “Clear file”/“Reset” action to remove an uploaded file URL from the field (set the value back to `""`) and wire that into the `onChange` handler.
- [ ] Test the workflow run form end-to-end with a sample workflow using the provided JSON schema snippet, verifying:
  - File selection → Supabase upload → signed URL creation.
  - Successful form submission and validation.
  - n8n receives only the URL in the payload and can download the file via HTTP Request.
