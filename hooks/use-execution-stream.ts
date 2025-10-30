"use client";

import { useEffect, useRef, useState } from "react";

export type ExecutionEvent = {
  id: string;
  timestamp: string;
  stage: string;
  message: string | null;
  raw: unknown;
};

export type ExecutionUpdate = {
  id: string;
  status?: string;
  finished_at?: string | null;
  output_payload?: unknown;
  result_file_url?: string | null;
  error_message?: string | null;
};

export type ExecutionStreamMessage =
  | { type: "connected"; executionId: string }
  | { type: "heartbeat"; timestamp: string }
  | { type: "execution_event"; data: ExecutionEvent }
  | { type: "execution_update"; data: ExecutionUpdate };

export function useExecutionStream(executionId: string | undefined) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [update, setUpdate] = useState<ExecutionUpdate | null>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!executionId) return;

    const url = `/api/executions/${executionId}/stream`;
    const es = new EventSource(url);
    evtSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as ExecutionStreamMessage;

        if (payload.type === "connected") {
          // noop
        } else if (payload.type === "heartbeat") {
          // noop
        } else if (payload.type === "execution_event") {
          setEvents((prev) => [...prev, payload.data]);
        } else if (payload.type === "execution_update") {
          setUpdate(payload.data);
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    es.onerror = (err) => {
      console.error("SSE error", err);
      setConnected(false);
      // EventSource will auto-reconnect; keep state reset
    };

    return () => {
      es.close();
      evtSourceRef.current = null;
      setConnected(false);
    };
  }, [executionId]);

  return { connected, events, update };
}
