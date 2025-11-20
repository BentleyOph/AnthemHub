import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const WORKFLOW_INPUT_BUCKET =
  process.env.NEXT_PUBLIC_WORKFLOW_INPUT_BUCKET ?? "file-uploads";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24; // 24 hours
const WORKFLOW_INPUT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

const MIME_TYPE_EXTENSION_MAP = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["text/csv", ".csv"],
  ["application/vnd.ms-excel", ".csv"],
  ["text/plain", ".csv"],
]);

const ALLOWED_MIME_TYPES = new Set(MIME_TYPE_EXTENSION_MAP.keys());

export class WorkflowInputUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowInputUploadError";
  }
}

function sanitizeExtension(extension: string | null, mimeType: string): string {
  const normalized = extension?.toLowerCase();
  const mapped = MIME_TYPE_EXTENSION_MAP.get(mimeType);

  if (normalized && mapped && normalized === mapped) {
    return normalized;
  }

  return mapped ?? ".bin";
}

function extractExtension(filename: string | undefined): string | null {
  if (!filename) {
    return null;
  }
  const dot = filename.lastIndexOf(".");
  if (dot === -1) {
    return null;
  }
  return filename.slice(dot).toLowerCase();
}

function validateWorkflowInputFile(file: File): { contentType: string; extension: string } {
  if (file.size <= 0) {
    throw new WorkflowInputUploadError("File is empty. Please choose another PDF or CSV.");
  }

  if (file.size > WORKFLOW_INPUT_MAX_BYTES) {
    throw new WorkflowInputUploadError("File must be 20MB or smaller.");
  }

  const rawMime = file.type?.trim().toLowerCase();
  if (!rawMime || !ALLOWED_MIME_TYPES.has(rawMime)) {
    throw new WorkflowInputUploadError("File must be a PDF or CSV.");
  }

  const extension = sanitizeExtension(extractExtension(file.name), rawMime);

  return {
    contentType: rawMime,
    extension,
  };
}

function generateObjectPath(extension: string): string {
  if (typeof crypto?.randomUUID === "function") {
    return `${crypto.randomUUID()}${extension}`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`;
}

export async function uploadWorkflowInputFile(file: File): Promise<{
  path: string;
  signedUrl: string;
  expiresAt: number;
}> {
  const { contentType, extension } = validateWorkflowInputFile(file);
  const supabase = getSupabaseBrowserClient();
  const objectPath = generateObjectPath(extension);

  const { error: uploadError } = await supabase.storage
    .from(WORKFLOW_INPUT_BUCKET)
    .upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (uploadError) {
    throw new WorkflowInputUploadError(uploadError.message);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(WORKFLOW_INPUT_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

  if (signedError || !signed?.signedUrl) {
    throw new WorkflowInputUploadError(signedError?.message ?? "Failed to create download link.");
  }

  return {
    path: objectPath,
    signedUrl: signed.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000,
  };
}

export { WORKFLOW_INPUT_BUCKET, WORKFLOW_INPUT_MAX_BYTES, SIGNED_URL_EXPIRY_SECONDS };
