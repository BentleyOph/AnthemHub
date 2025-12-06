To implement "Private" workflows that are hidden from the catalog but can still be assigned to specific clients by an admin, we need to introduce a **Visibility** concept to the database.

Here is the step-by-step implementation plan:

1.  **Database**: Add a `visibility` column to the `workflow` table.
2.  **Types & Schema**: Update the Admin Zod schemas and types.
3.  **Admin UI**: Update the Workflow Form to allow selecting Visibility.
4.  **Client Catalog**: Update the catalog query to exclude private workflows.
5.  **Access Control**: Prevent clients from requesting access to private workflows via the API.

### 1. Database Migration

Create a new migration file to add the column.

**File:** `supabase/migrations/20251207000000_add_workflow_visibility.sql`

```sql
-- Create visibility enum type (optional, or just use text check constraint)
-- We will use text with check for simplicity as per previous patterns
ALTER TABLE public.workflow
ADD COLUMN visibility text NOT NULL DEFAULT 'CATALOG' CHECK (visibility IN ('CATALOG', 'PRIVATE'));

COMMENT ON COLUMN public.workflow.visibility IS 'CATALOG: Visible to all clients. PRIVATE: Hidden, assignable by admin only.';

-- Update RLS policy for "anyone read published workflows" to strictly respect CATALOG visibility
DROP POLICY IF EXISTS "anyone read published workflows" ON public.workflow;

CREATE POLICY "anyone read published workflows"
ON public.workflow
FOR SELECT
TO public
USING (is_published = true AND visibility = 'CATALOG');

-- Allow clients to read workflows they are assigned to, even if PRIVATE
CREATE POLICY "clients read assigned workflows"
ON public.workflow
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM client_workflow_access cwa
    JOIN user_profile up ON up.client_id = cwa.client_id
    WHERE cwa.workflow_id = workflow.id
    AND up.id = auth.uid()
  )
);
```

### 2. Update Admin Types and Logic

Update the data handling to read/write the new column.

**File:** `lib/admin/workflows/data.ts`

```typescript
// ... existing imports

export const workflowUpsertSchema = z.object({
  // ... existing fields
  name: z.string().trim().min(2).max(255),
  publicDesc: z.string().trim().min(10).max(2000),
  // ...
  isPublished: z.boolean().default(false),
  // ADD THIS:
  visibility: z.enum(["CATALOG", "PRIVATE"]).default("CATALOG"),
  // ...
});

// Update the Parsed Type
type WorkflowUpsertParsed = {
  // ... existing fields
  is_published: boolean;
  visibility: "CATALOG" | "PRIVATE"; // Add this
  // ...
};

// Update Detail Row Type
type WorkflowDetailRow = {
  // ... existing fields
  is_published: boolean;
  visibility: "CATALOG" | "PRIVATE"; // Add this
  // ...
};

// Update Public Detail Type
export type WorkflowDetail = {
  // ... existing fields
  isPublished: boolean;
  visibility: "CATALOG" | "PRIVATE"; // Add this
  // ...
};

// ... inside normalizeUpsertPayload ...
function normalizeUpsertPayload(
  payload: WorkflowUpsertInput,
  iconPath?: string | null,
): WorkflowUpsertParsed {
  const parsed = workflowUpsertSchema.parse(payload);
  const shouldRemoveIcon = Boolean(payload.removeIcon);

  return {
    name: parsed.name,
    public_desc: parsed.publicDesc,
    internal_notes: parsed.internalNotes ?? null,
    n8n_webhook_url: parsed.n8nWebhookUrl,
    input_schema: parseInputSchema(parsed.inputSchema),
    is_published: parsed.isPublished ?? false,
    visibility: parsed.visibility, // Add this
    icon_url: iconPath ?? (shouldRemoveIcon ? null : undefined),
    estimated_minutes_saved: parsed.estimatedMinutesSaved,
  };
}

// ... inside listWorkflows ...
// (Optional: You might want to return visibility in the list items to show an icon in the table)

// ... inside getWorkflowDetail ...
export async function getWorkflowDetail(id: string): Promise<WorkflowDetail | null> {
  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("workflow")
    .select(
      `
        id,
        name,
        public_desc,
        internal_notes,
        icon_url,
        n8n_webhook_url,
        input_schema,
        is_published,
        visibility, 
        estimated_minutes_saved,
        created_at,
        updated_at
      `,
    )
    .eq("id", id)
    .maybeSingle<WorkflowDetailRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    // ... existing mappings
    id: data.id,
    name: data.name,
    description: data.public_desc,
    internalNotes: data.internal_notes,
    iconUrl: await resolveWorkflowIconUrl(data.icon_url),
    n8nWebhookUrl: data.n8n_webhook_url,
    inputSchema: data.input_schema,
    isPublished: data.is_published,
    visibility: data.visibility, // Add this
    estimatedMinutesSaved: data.estimated_minutes_saved,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ... update createWorkflow and updateWorkflow selects to include 'visibility' ...
```

### 3. Update Admin UI (Workflow Form)

Add the selector to the form.

**File:** `components/admin/workflows/workflow-form.tsx`

```tsx
// ... imports
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Ensure Select is imported

// ...

type FormState = {
  // ...
  isPublished: boolean;
  visibility: "CATALOG" | "PRIVATE"; // Add this
  // ...
};

export function WorkflowForm({ mode, workflow, showHeader = true }: Props) {
  // ...
  const [formState, setFormState] = useState<FormState>(() => {
    // ...
    return {
      // ...
      isPublished: workflow?.isPublished ?? false,
      visibility: workflow?.visibility ?? "CATALOG", // Add default
      // ...
    };
  });

  // ... inside handleSubmit, add formData.set ...
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // ...
    formData.set("isPublished", String(formState.isPublished));
    formData.set("visibility", formState.visibility); // Add this
    // ...
  };

  const isDirty = useMemo(() => {
    if (!workflow) {
      return (
        // ... existing checks
        formState.visibility !== "CATALOG" || // Add Check
        formState.isPublished // etc
      );
    }
    return (
      // ... existing checks
      formState.visibility !== workflow.visibility || // Add Check
      formState.isPublished !== workflow.isPublished
      // ...
    );
  }, [formState, workflow]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ... Left Column ... */}
      
      {/* ... Right Column (Sidebar) ... */}
      <div className="space-y-6">
        {/* ... Icon Section ... */}

        <div className="space-y-3 rounded-lg border p-4">
          <Label className="font-medium">Visibility & Status</Label>
          
          {/* Visibility Select */}
          <div className="space-y-2">
            <Label htmlFor="workflow-visibility" className="text-xs text-muted-foreground">
              Visibility
            </Label>
            <Select
              value={formState.visibility}
              onValueChange={(val) => setFormState(prev => ({...prev, visibility: val as "CATALOG" | "PRIVATE"}))}
              disabled={isSubmitting}
            >
              <SelectTrigger id="workflow-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CATALOG">Catalog (Public)</SelectItem>
                <SelectItem value="PRIVATE">Private (Hidden)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formState.visibility === "CATALOG" 
                ? "Visible to all clients in the catalog." 
                : "Hidden from catalog. Only accessible if assigned by admin."}
            </p>
          </div>

          <div className="my-2 h-px bg-border" />

          {/* Published Checkbox */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="workflow-published"
              checked={formState.isPublished}
              onCheckedChange={(checked) =>
                setFormState((prev) => ({
                  ...prev,
                  isPublished: Boolean(checked),
                }))
              }
              disabled={isSubmitting}
            />
            <div className="space-y-1 text-sm">
              <Label htmlFor="workflow-published">Published</Label>
              <p className="text-xs text-muted-foreground">
                Drafts are never visible/runnable, regardless of visibility setting.
              </p>
            </div>
          </div>
        </div>

        {/* ... Danger Zone ... */}
      </div>
    </form>
  );
}
```

### 4. Update Client Catalog Logic

Filter out private workflows from the catalog page.

**File:** `lib/client/catalog.ts`

```typescript
// ... inside loadWorkflows ...

async function loadWorkflows(
  supabase: SupabaseClient,
  context: ClientAccessContext,
): Promise<CatalogWorkflowItem[]> {
  const assignedSet = new Set(context.assignedWorkflowIds);
  const requestMap = new Map(
    context.accessRequests.map((request) => [request.workflowId, request]),
  );

  const { data, error } = await supabase
    .from("workflow")
    .select("id, name, public_desc, icon_url, is_published, updated_at")
    .eq("is_published", true)
    .eq("visibility", "CATALOG") // ADD THIS: Only fetch catalog items
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }
  
  // ... rest of function
}
```

### 5. Secure Access Request Endpoint

Ensure a clever user cannot manually send a POST request to request access to a private workflow ID they guessed.

**File:** `app/api/requests/access/route.ts`

```typescript
// ... imports

export async function POST(request: NextRequest) {
  // ... existing auth checks ...

  const { data: workflowRow, error: workflowError } = await supabase
    .from("workflow")
    .select("id, is_published, visibility") // Fetch visibility
    .eq("id", payload.workflowId)
    .maybeSingle<{ id: string; is_published: boolean | null; visibility: string }>();

  // ... error checks ...

  if (!workflowRow.is_published) {
    return NextResponse.json(
      { error: "Workflow is not available for requests yet." },
      { status: 400 },
    );
  }

  // ADD THIS CHECK
  if (workflowRow.visibility === 'PRIVATE') {
    return NextResponse.json(
      { error: "This workflow is private and cannot be requested. Contact your account manager." },
      { status: 403 },
    );
  }

  // ... proceed with insert ...
}
```

### 6. Update Admin Workflows Table to Show Visibility

**File:** `components/admin/workflows/workflows-table.tsx`

```tsx
// ... existing imports
import { Badge } from "@/components/ui/badge";

// ... inside columns definition ...
{
  accessorKey: "visibility",
  header: "Visibility",
  cell: ({ row }) => (
    <Badge variant={row.original.visibility === "PRIVATE" ? "secondary" : "outline"}>
      {row.original.visibility === "PRIVATE" ? "🔒 Private" : "📢 Catalog"}
    </Badge>
  ),
},
```

### Summary of Resulting Behavior

1.  **Catalog Page:** Only shows workflows where `is_published = true` AND `visibility = 'CATALOG'`.
2.  **Private Workflows:**
    *   Do not appear in the catalog.
    *   Cannot be requested via the "Request Access" button (button won't exist in UI, API rejects it).
    *   **However**, if an Admin assigns a Private workflow to a Client via the Admin Client Dashboard (`ClientAccessManager`), that client *will* see it in their "My Workflows" list (because `getClientWorkflowsData` queries `client_workflow_access` directly, bypassing the catalog filter).
    *   The client can then run the workflow normally.