"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconCalendarPlus,
  IconClock,
  IconEdit,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import type {
  WorkflowClientOption,
  WorkflowPresetWithSchedules,
  WorkflowSchedule,
} from "@/lib/admin/workflows/presets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  workflowId: string;
  presets: WorkflowPresetWithSchedules[];
  clientOptions: WorkflowClientOption[];
  timeZone: string;
};

type SheetState =
  | { type: "createPreset" }
  | { type: "editPreset"; presetId: string }
  | { type: "createSchedule"; presetId: string }
  | { type: "editSchedule"; presetId: string; scheduleId: string }
  | null;

type PresetFormState = {
  clientId: string;
  name: string;
  description: string;
  inputPayload: string;
};

type ScheduleFormState = {
  name: string;
  cronExpr: string;
  timezone: string;
  isActive: boolean;
};

const CRON_SUGGESTIONS = [
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 09:00", value: "0 9 * * *" },
  { label: "Weekdays 08:30", value: "30 8 * * 1-5" },
];

const textareaClassName =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 bg-transparent w-full rounded-md border px-3 py-2 text-sm font-mono leading-relaxed shadow-xs outline-none focus-visible:ring-[3px]";

function stringifyPayload(value: Record<string, unknown> | undefined): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{\n  \n}";
  }
}

function formatDate(value: string | null, formatter: Intl.DateTimeFormat) {
  if (!value) {
    return "—";
  }
  try {
    return formatter.format(new Date(value));
  } catch {
    return value;
  }
}

export function WorkflowSchedulingPanel({
  workflowId,
  presets,
  clientOptions,
  timeZone,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<WorkflowPresetWithSchedules[]>(presets);
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [presetForm, setPresetForm] = useState<PresetFormState>({
    clientId: clientOptions[0]?.id ?? "",
    name: "",
    description: "",
    inputPayload: "{\n  \n}",
  });
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({
    name: "",
    cronExpr: "0 9 * * *",
    timezone: timeZone,
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [timeZone],
  );

  const currentPreset =
    sheetState && sheetState.type !== "createPreset"
      ? items.find((preset) => preset.id === sheetState.presetId)
      : null;

  const currentSchedule =
    sheetState && sheetState.type === "editSchedule"
      ? currentPreset?.schedules.find(
          (schedule) => schedule.id === sheetState.scheduleId,
        ) ?? null
      : null;

  const openPresetSheet = (
    type: "createPreset" | "editPreset",
    preset?: WorkflowPresetWithSchedules,
  ) => {
    if (type === "createPreset") {
      setPresetForm({
        clientId: clientOptions[0]?.id ?? "",
        name: "",
        description: "",
        inputPayload: "{\n  \n}",
      });
      setSheetState({ type: "createPreset" });
    } else if (preset) {
      setPresetForm({
        clientId: preset.clientId,
        name: preset.name,
        description: preset.description ?? "",
        inputPayload: stringifyPayload(preset.inputPayload),
      });
      setSheetState({ type: "editPreset", presetId: preset.id });
    }
    setFormError(null);
  };

  const openScheduleSheet = (
    type: "createSchedule" | "editSchedule",
    preset: WorkflowPresetWithSchedules,
    schedule?: WorkflowSchedule,
  ) => {
    if (type === "createSchedule") {
      setScheduleForm({
        name: `${preset.name} schedule`,
        cronExpr: "0 9 * * *",
        timezone: timeZone,
        isActive: true,
      });
      setSheetState({ type: "createSchedule", presetId: preset.id });
    } else if (schedule) {
      setScheduleForm({
        name: schedule.name,
        cronExpr: schedule.cronExpr,
        timezone: schedule.timezone,
        isActive: schedule.isActive,
      });
      setSheetState({
        type: "editSchedule",
        presetId: preset.id,
        scheduleId: schedule.id,
      });
    }
    setFormError(null);
  };

  const closeSheet = () => {
    setSheetState(null);
    setFormError(null);
  };

  const parseInputPayload = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(presetForm.inputPayload || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setFormError("Input payload must be a JSON object.");
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      console.error("Invalid input payload", error);
      setFormError("Input payload must be valid JSON.");
      return null;
    }
  };

  const handleCreatePreset = () => {
    const payload = parseInputPayload();
    if (!payload) return;

    if (!presetForm.clientId) {
      setFormError("Client is required.");
      return;
    }

    if (!presetForm.name.trim()) {
      setFormError("Preset name is required.");
      return;
    }

    setFormError(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/workflows/${workflowId}/presets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: presetForm.clientId,
              name: presetForm.name.trim(),
              description: presetForm.description.trim() || undefined,
              inputPayload: payload,
            }),
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setFormError(
            (data as { error?: string }).error ??
              "Failed to create preset.",
          );
          return;
        }

        const created = (await response.json()) as WorkflowPresetWithSchedules;
        setItems((prev) => [...prev, created]);
        closeSheet();
        router.refresh();
      } catch (error) {
        console.error("Failed to create preset", error);
        setFormError("Unexpected error creating preset.");
      }
    });
  };

  const handleUpdatePreset = () => {
    const payload = parseInputPayload();
    if (!payload || !currentPreset || sheetState?.type !== "editPreset") {
      return;
    }

    if (!presetForm.name.trim()) {
      setFormError("Preset name is required.");
      return;
    }

    setFormError(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/workflow-presets/${currentPreset.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: presetForm.name.trim(),
              description: presetForm.description.trim() || undefined,
              inputPayload: payload,
            }),
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setFormError(
            (data as { error?: string }).error ??
              "Failed to update preset.",
          );
          return;
        }

        const updated = (await response.json()) as WorkflowPresetWithSchedules;
        setItems((prev) =>
          prev.map((preset) => (preset.id === updated.id ? updated : preset)),
        );
        closeSheet();
        router.refresh();
      } catch (error) {
        console.error("Failed to update preset", error);
        setFormError("Unexpected error updating preset.");
      }
    });
  };

  const handleDeletePreset = (presetId: string) => {
    const confirmDelete = window.confirm(
      "Delete this preset and all of its schedules?",
    );
    if (!confirmDelete) return;

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/workflow-presets/${presetId}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok && response.status !== 204) {
          const data = await response.json().catch(() => ({}));
          console.error("Failed to delete preset", data);
          return;
        }

        setItems((prev) => prev.filter((preset) => preset.id !== presetId));
        router.refresh();
      } catch (error) {
        console.error("Failed to delete preset", error);
      }
    });
  };

  const handleSubmitSchedule = () => {
    if (!scheduleForm.name.trim()) {
      setFormError("Schedule name is required.");
      return;
    }

    if (!scheduleForm.cronExpr.trim()) {
      setFormError("Cron expression is required.");
      return;
    }

    if (!scheduleForm.timezone.trim()) {
      setFormError("Timezone is required.");
      return;
    }

    if (!sheetState) {
      return;
    }

    const payload = {
      name: scheduleForm.name.trim(),
      cronExpr: scheduleForm.cronExpr.trim(),
      timezone: scheduleForm.timezone.trim(),
      isActive: scheduleForm.isActive,
    };

    setFormError(null);

    startTransition(async () => {
      try {
        if (sheetState.type === "createSchedule") {
          const response = await fetch(
            `/api/admin/workflow-schedules`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                presetId: sheetState.presetId,
                ...payload,
              }),
            },
          );

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            setFormError(
              (data as { error?: string }).error ??
                "Failed to create schedule.",
            );
            return;
          }

          const created = (await response.json()) as WorkflowSchedule;
          setItems((prev) =>
            prev.map((preset) =>
              preset.id === sheetState.presetId
                ? { ...preset, schedules: [...preset.schedules, created] }
                : preset,
            ),
          );
        } else if (
          sheetState.type === "editSchedule" &&
          sheetState.scheduleId
        ) {
          const response = await fetch(
            `/api/admin/workflow-schedules/${sheetState.scheduleId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            setFormError(
              (data as { error?: string }).error ??
                "Failed to update schedule.",
            );
            return;
          }

          const updated = (await response.json()) as WorkflowSchedule;
          setItems((prev) =>
            prev.map((preset) =>
              preset.id === sheetState.presetId
                ? {
                    ...preset,
                    schedules: preset.schedules.map((schedule) =>
                      schedule.id === updated.id ? updated : schedule,
                    ),
                  }
                : preset,
            ),
          );
        }

        closeSheet();
        router.refresh();
      } catch (error) {
        console.error("Failed to upsert schedule", error);
        setFormError("Unexpected error saving schedule.");
      }
    });
  };

  const handleDeleteSchedule = (presetId: string, scheduleId: string) => {
    const confirmDelete = window.confirm("Delete this schedule?");
    if (!confirmDelete) return;

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/workflow-schedules/${scheduleId}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok && response.status !== 204) {
          const data = await response.json().catch(() => ({}));
          console.error("Failed to delete schedule", data);
          return;
        }

        setItems((prev) =>
          prev.map((preset) =>
            preset.id === presetId
              ? {
                  ...preset,
                  schedules: preset.schedules.filter(
                    (schedule) => schedule.id !== scheduleId,
                  ),
                }
              : preset,
          ),
        );
        router.refresh();
      } catch (error) {
        console.error("Failed to delete schedule", error);
      }
    });
  };

  const handleToggleSchedule = (
    presetId: string,
    schedule: WorkflowSchedule,
  ) => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/workflow-schedules/${schedule.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: schedule.name,
              cronExpr: schedule.cronExpr,
              timezone: schedule.timezone,
              isActive: !schedule.isActive,
            }),
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          console.error("Failed to toggle schedule", data);
          return;
        }

        const updated = (await response.json()) as WorkflowSchedule;
        setItems((prev) =>
          prev.map((preset) =>
            preset.id === presetId
              ? {
                  ...preset,
                  schedules: preset.schedules.map((candidate) =>
                    candidate.id === updated.id ? updated : candidate,
                  ),
                }
              : preset,
          ),
        );
        router.refresh();
      } catch (error) {
        console.error("Failed to toggle schedule", error);
      }
    });
  };

  const renderSchedules = (preset: WorkflowPresetWithSchedules) => {
    if (preset.schedules.length === 0) {
      return (
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          No schedules yet. Add one to start automated runs.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {preset.schedules.map((schedule) => (
          <div
            key={schedule.id}
            className="rounded-md border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 font-medium">
                  {schedule.name}
                  <Badge variant={schedule.isActive ? "default" : "secondary"}>
                    {schedule.isActive ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  cron: {schedule.cronExpr} · tz: {schedule.timezone}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => handleToggleSchedule(preset.id, schedule)}
                  disabled={isSubmitting}
                >
                  {schedule.isActive ? (
                    <>
                      <IconPlayerPause className="mr-1 size-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <IconPlayerPlay className="mr-1 size-4" />
                      Resume
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => openScheduleSheet("editSchedule", preset, schedule)}
                >
                  <IconEdit className="mr-1 size-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => handleDeleteSchedule(preset.id, schedule.id)}
                  disabled={isSubmitting}
                >
                  <IconTrash className="mr-1 size-4" />
                  Delete
                </Button>
              </div>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <IconClock className="size-3.5" />
                <span>
                  Last run: {formatDate(schedule.lastRunAt, formatter)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconCalendarPlus className="size-3.5" />
                <span>
                  Next run: {formatDate(schedule.nextRunAt, formatter)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => openPresetSheet("createPreset")}
          disabled={clientOptions.length === 0}
        >
          <IconPlus className="mr-2 size-4" />
          New preset
        </Button>
        {clientOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Assign this workflow to at least one client before creating presets.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No presets yet. Presets bundle a workflow, client, and default input payload.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((preset) => (
            <div
              key={preset.id}
              className="rounded-lg border p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{preset.name}</h3>
                    <Badge variant="secondary">{preset.clientName}</Badge>
                  </div>
                  {preset.description ? (
                    <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                      {preset.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No description provided.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Default payload size:{" "}
                    {String(stringifyPayload(preset.inputPayload).length)} chars
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPresetSheet("editPreset", preset)}
                  >
                    <IconEdit className="mr-1 size-4" />
                    Edit preset
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openScheduleSheet("createSchedule", preset)}
                  >
                    <IconCalendarPlus className="mr-1 size-4" />
                    Add schedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDeletePreset(preset.id)}
                    disabled={isSubmitting}
                  >
                    <IconTrash className="mr-1 size-4" />
                    Delete
                  </Button>
                </div>
              </div>
              {renderSchedules(preset)}
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(sheetState)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent className="w-full max-w-xl overflow-y-auto">
          {sheetState?.type === "createPreset" && (
            <>
              <SheetHeader>
                <SheetTitle>Create preset</SheetTitle>
                <SheetDescription>
                  Bind this workflow to a client with a reusable default payload.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-4 pb-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select
                    value={presetForm.clientId}
                    onValueChange={(value) =>
                      setPresetForm((prev) => ({ ...prev, clientId: value }))
                    }
                  >
                    <SelectTrigger className="w-full justify-between">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {clientOptions.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={presetForm.name}
                    onChange={(event) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Quarterly compliance preset"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={presetForm.description}
                    onChange={(event) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Optional helper text"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default input payload (JSON)</Label>
                  <textarea
                    className={textareaClassName}
                    rows={12}
                    value={presetForm.inputPayload}
                    onChange={(event) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        inputPayload: event.target.value,
                      }))
                    }
                  />
                </div>
                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}
              </div>
              <SheetFooter className="mt-6 flex flex-row justify-end gap-3">
                <Button variant="ghost" type="button" onClick={closeSheet}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreatePreset}
                  disabled={isSubmitting}
                >
                  Save preset
                </Button>
              </SheetFooter>
            </>
          )}

          {sheetState?.type === "editPreset" && currentPreset && (
            <>
              <SheetHeader>
                <SheetTitle>Edit preset</SheetTitle>
                <SheetDescription>
                  Update metadata or payload defaults for this preset.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-4 pb-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Input value={currentPreset.clientName} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={presetForm.name}
                    onChange={(event) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={presetForm.description}
                    onChange={(event) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default input payload (JSON)</Label>
                  <textarea
                    className={textareaClassName}
                    rows={12}
                    value={presetForm.inputPayload}
                    onChange={(event) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        inputPayload: event.target.value,
                      }))
                    }
                  />
                </div>
                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}
              </div>
              <SheetFooter className="mt-6 flex flex-row justify-end gap-3">
                <Button variant="ghost" type="button" onClick={closeSheet}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleUpdatePreset}
                  disabled={isSubmitting}
                >
                  Update preset
                </Button>
              </SheetFooter>
            </>
          )}

          {sheetState &&
            (sheetState.type === "createSchedule" ||
              (sheetState.type === "editSchedule" &&
                currentPreset &&
                currentSchedule)) && (
              <>
                <SheetHeader>
                  <SheetTitle>
                    {sheetState.type === "createSchedule"
                      ? `New schedule for ${currentPreset?.name ?? ""}`
                      : `Edit schedule ${currentSchedule?.name ?? ""}`}
                  </SheetTitle>
                  <SheetDescription>
                    Configure cron expression, timezone, and activation state.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4 px-4 pb-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={scheduleForm.name}
                      onChange={(event) =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Daily run"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cron expression</Label>
                    <Input
                      value={scheduleForm.cronExpr}
                      onChange={(event) =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          cronExpr: event.target.value,
                        }))
                      }
                      placeholder="*/30 * * * *"
                    />
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {CRON_SUGGESTIONS.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion.value}
                          className="rounded border px-2 py-1 transition hover:bg-muted"
                          onClick={() =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              cronExpr: suggestion.value,
                            }))
                          }
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Input
                      value={scheduleForm.timezone}
                      onChange={(event) =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          timezone: event.target.value,
                        }))
                      }
                      placeholder="Africa/Nairobi"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="schedule-active"
                      checked={scheduleForm.isActive}
                      onCheckedChange={(checked) =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          isActive: Boolean(checked),
                        }))
                      }
                    />
                    <Label htmlFor="schedule-active" className="text-sm">
                      Schedule is active
                    </Label>
                  </div>
                  {formError && (
                    <p className="text-sm text-destructive">{formError}</p>
                  )}
                </div>
                <SheetFooter className="mt-6 flex flex-row justify-end gap-3">
                  <Button variant="ghost" type="button" onClick={closeSheet}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitSchedule}
                    disabled={isSubmitting}
                  >
                    Save schedule
                  </Button>
                </SheetFooter>
              </>
            )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
