import { type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const pathParamsSchema = z.object({
  id: z.string().uuid(),
});

// Set the runtime to nodejs for long-lived connections
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/executions/:id/stream
 *
 * Server-Sent Events endpoint that streams execution_event and execution updates
 * for a given execution id in near real-time.
 *
 * Authorization: Verifies requester can access the execution (via RLS) before opening stream.
 * Uses service role only for the Realtime subscription after authorization check.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Await params in Next.js 15
  const params = await context.params;
  
  // Validate path params
  const parsedParams = pathParamsSchema.safeParse(params);
  if (!parsedParams.success) {
    return new Response("Invalid execution id", { status: 400 });
  }

  const { id: executionId } = parsedParams.data;

  // Authorization check: verify the user can access this execution using RLS
  try {
    const userSupabase = await getSupabaseServerClient();
    const { data: execution, error } = await userSupabase
      .from("execution")
      .select("id")
      .eq("id", executionId)
      .maybeSingle();

    if (error) {
      // RLS failures (42501) or not found (PGRST116)
      if (error.code === "42501" || error.code === "PGRST116") {
        return new Response("Execution not found or access denied", { status: 403 });
      }
      console.error("Authorization check failed:", error);
      return new Response("Authorization failed", { status: 500 });
    }

    if (!execution) {
      return new Response("Execution not found", { status: 404 });
    }
  } catch (error) {
    console.error("Authorization check error:", error);
    return new Response("Authorization failed", { status: 500 });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE message
      const sendEvent = (data: unknown, event?: string) => {
        const message = event ? `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` : `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial connection message
      sendEvent({ type: "connected", executionId }, "message");

      // Set up Realtime subscription using service role client
      // (after authorization check passed)
      const serviceSupabase = getSupabaseServiceRoleClient();

      // Subscribe to execution_event changes for this execution
      const eventChannel = serviceSupabase
        .channel(`execution-events:${executionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "execution_event",
            filter: `execution_id=eq.${executionId}`,
          },
          (payload) => {
            console.log("Received execution_event INSERT:", payload.new);
            sendEvent({
              type: "execution_event",
              data: {
                id: payload.new.id,
                timestamp: payload.new.timestamp,
                stage: payload.new.stage,
                message: payload.new.message,
                raw: payload.new.raw,
              },
            }, "message");
          },
        )
        .subscribe((status) => {
          console.log(`Event channel subscription status: ${status}`);
        });

      // Subscribe to execution table updates for status changes
      const executionChannel = serviceSupabase
        .channel(`execution:${executionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "execution",
            filter: `id=eq.${executionId}`,
          },
          (payload) => {
            console.log("Received execution UPDATE:", payload.new);
            sendEvent({
              type: "execution_update",
              data: {
                id: payload.new.id,
                status: payload.new.status,
                finished_at: payload.new.finished_at,
                output_payload: payload.new.output_payload,
                result_file_url: payload.new.result_file_url,
                error_message: payload.new.error_message,
              },
            }, "message");
          },
        )
        .subscribe((status) => {
          console.log(`Execution channel subscription status: ${status}`);
        });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        console.log(`Client disconnected from stream for execution ${executionId}`);
        serviceSupabase.removeChannel(eventChannel);
        serviceSupabase.removeChannel(executionChannel);
        controller.close();
      });

      // Keep connection alive with periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          sendEvent({ type: "heartbeat", timestamp: new Date().toISOString() }, "heartbeat");
        } catch (error) {
          console.error("Heartbeat failed:", error);
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Every 30 seconds

      // Clean up on stream close
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        serviceSupabase.removeChannel(eventChannel);
        serviceSupabase.removeChannel(executionChannel);
      };

      // Handle errors
      try {
        await new Promise((_, reject) => {
          request.signal.addEventListener("abort", () => reject(new Error("Client disconnected")));
        });
      } catch {
        cleanup();
      }
    },
  });

  // Return SSE response with appropriate headers
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
