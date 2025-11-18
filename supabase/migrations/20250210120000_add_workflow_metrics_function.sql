-- Workflow-level metrics for the admin workflows table
CREATE OR REPLACE FUNCTION public.get_workflow_admin_metrics(workflow_ids uuid[])
RETURNS TABLE (
    workflow_id uuid,
    total_runs_30d BIGINT,
    success_rate_30d NUMERIC,
    avg_runtime_seconds NUMERIC,
    active_schedules INTEGER
)
LANGUAGE sql
STABLE
AS $function$
    WITH requested_workflows AS (
        SELECT DISTINCT id
        FROM UNNEST(COALESCE(workflow_ids, ARRAY[]::uuid[])) AS w(id)
    ),
    recent_executions AS (
        SELECT
            e.workflow_id,
            e.status,
            e.started_at,
            e.finished_at
        FROM execution e
        JOIN requested_workflows rw ON rw.id = e.workflow_id
        WHERE e.started_at >= now() - interval '30 days'
    ),
    execution_stats AS (
        SELECT
            workflow_id,
            COUNT(*) AS total_runs,
            COUNT(*) FILTER (WHERE status = 'SUCCESS'::exec_status) AS success_runs,
            AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) FILTER (WHERE finished_at IS NOT NULL) AS avg_runtime_sec
        FROM recent_executions
        GROUP BY workflow_id
    ),
    schedule_stats AS (
        SELECT
            wp.workflow_id,
            COUNT(*) AS active_schedules
        FROM workflow_schedule ws
        JOIN workflow_preset wp ON wp.id = ws.workflow_preset_id
        JOIN requested_workflows rw ON rw.id = wp.workflow_id
        WHERE ws.is_active = true
        GROUP BY wp.workflow_id
    )
    SELECT
        rw.id AS workflow_id,
        COALESCE(es.total_runs, 0) AS total_runs_30d,
        CASE
            WHEN es.total_runs IS NULL OR es.total_runs = 0 THEN NULL
            ELSE ROUND((es.success_runs::NUMERIC / NULLIF(es.total_runs, 0)) * 100, 1)
        END AS success_rate_30d,
        CASE
            WHEN es.avg_runtime_sec IS NULL THEN NULL
            ELSE ROUND(es.avg_runtime_sec::NUMERIC, 1)
        END AS avg_runtime_seconds,
        COALESCE(ss.active_schedules, 0) AS active_schedules
    FROM requested_workflows rw
    LEFT JOIN execution_stats es ON es.workflow_id = rw.id
    LEFT JOIN schedule_stats ss ON ss.workflow_id = rw.id;
$function$;
