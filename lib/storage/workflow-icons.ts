import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import { createSignedUrl, uploadToSupabase } from "./supabase";

export const WORKFLOW_ICON_BUCKET =
  process.env.SUPABASE_WORKFLOW_ICON_BUCKET ?? "workflow-icons";

export const WORKFLOW_ICON_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_ICON_EXPIRY_SECONDS = 3600;

const MIME_TYPE_EXTENSION_MAP = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/svg+xml", ".svg"],
]);

const ALLOWED_MIME_TYPES = new Set(MIME_TYPE_EXTENSION_MAP.keys());
const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
]);

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function sanitizeExtension(extension: string | null, mimeType: string): string {
  const normalized = (extension ?? "").toLowerCase();

  if (normalized && ALLOWED_EXTENSIONS.has(normalized)) {
    return normalized;
  }

  const mapped = MIME_TYPE_EXTENSION_MAP.get(mimeType);
  if (mapped) {
    return mapped;
  }

  return ".png";
}

export class WorkflowIconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowIconError";
  }
}

function validateWorkflowIcon(file: File): { contentType: string; extension: string } {
  if (file.size <= 0) {
    throw new WorkflowIconError("Workflow icon file is empty.");
  }

  if (file.size > WORKFLOW_ICON_MAX_BYTES) {
    throw new WorkflowIconError("Workflow icon must be 2MB or smaller.");
  }

  const rawMime = file.type?.trim().toLowerCase();
  if (!rawMime || !ALLOWED_MIME_TYPES.has(rawMime)) {
    throw new WorkflowIconError("Workflow icon must be a PNG, JPG, SVG, or WebP image.");
  }

  const extension = sanitizeExtension(extname(file.name ?? "") || null, rawMime);

  return {
    contentType: rawMime,
    extension,
  };
}

function generateIconPath(extension: string): string {
  return `${randomUUID()}${extension}`;
}

export async function uploadWorkflowIcon(file: File): Promise<string> {
  const { contentType, extension } = validateWorkflowIcon(file);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = generateIconPath(extension);

  await uploadToSupabase(WORKFLOW_ICON_BUCKET, path, buffer, {
    contentType,
    upsert: true,
  });

  return path;
}

export async function resolveWorkflowIconUrl(
  iconPath: string | null,
  options?: { expiresInSeconds?: number },
): Promise<string | null> {
  if (!iconPath) {
    return null;
  }

  if (isAbsoluteUrl(iconPath)) {
    return iconPath;
  }

  try {
    const expiresInSeconds = options?.expiresInSeconds ?? DEFAULT_ICON_EXPIRY_SECONDS;
    const signed = await createSignedUrl(WORKFLOW_ICON_BUCKET, iconPath, expiresInSeconds);
    return signed?.signedUrl ?? null;
  } catch (error) {
    console.error("Failed to create signed URL for workflow icon", error);
    return null;
  }
}

export function getWorkflowIconExpiry(): number {
  return DEFAULT_ICON_EXPIRY_SECONDS;
}
