import { BlogClient } from "../api/blog-client.js";
import { DocsClient } from "../api/docs-client.js";
import { logger } from "./logger.js";
import { pool } from "./postgresPool.js";

const JOB_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    FAILED: "failed",
    SYNCED: "synced",
};

const PROCESSING_STALE_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 1000;

function getJobKey(resourceType, resourceId) {
    return `${resourceType}:${resourceId}`;
}

function getRetryDelayMs(attempts) {
    return Math.min(2 ** Math.max(attempts - 1, 0) * 3000, MAX_RETRY_DELAY_MS);
}

function getErrorMessage(error) {
    return (
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Canonical sync failed"
    );
}

async function deliverCanonicalSyncJob(job) {
    if (job.resource_type === "blog") {
        const payload = job.payload || {};
        await BlogClient.savePost(
            job.resource_id,
            payload.markdown,
            {
                visibility: payload.visibility,
                status: payload.status,
            },
            { userId: payload.userId },
        );
        return;
    }

    if (job.resource_type === "docs") {
        const payload = job.payload || {};
        await DocsClient.saveDocsContent(
            job.resource_id,
            payload.request,
            { userId: payload.userId },
        );
        return;
    }

    throw new Error(`Unsupported canonical sync resource type: ${job.resource_type}`);
}

export async function ensureCanonicalSyncSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS canonical_sync_jobs (
            job_key TEXT PRIMARY KEY,
            resource_type TEXT NOT NULL,
            resource_id UUID NOT NULL,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_error TEXT NULL,
            last_success_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_canonical_sync_jobs_due
        ON canonical_sync_jobs (status, next_attempt_at)
    `);
}

export async function enqueueCanonicalSyncJob(job, client = pool) {
    const jobKey = getJobKey(job.resourceType, job.resourceId);

    await client.query(
        `
        INSERT INTO canonical_sync_jobs (
            job_key,
            resource_type,
            resource_id,
            payload,
            status,
            attempts,
            next_attempt_at,
            last_error,
            updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, 0, now(), NULL, now())
        ON CONFLICT (job_key)
        DO UPDATE SET
            payload = EXCLUDED.payload,
            status = EXCLUDED.status,
            attempts = 0,
            next_attempt_at = now(),
            last_error = NULL,
            updated_at = now()
        `,
        [
            jobKey,
            job.resourceType,
            job.resourceId,
            JSON.stringify(job.payload),
            JOB_STATUS.PENDING,
        ],
    );

    return jobKey;
}

async function markJobSuccess(jobKey) {
    await pool.query(
        `
        UPDATE canonical_sync_jobs
        SET status = $2,
            next_attempt_at = now(),
            last_error = NULL,
            last_success_at = now(),
            updated_at = now()
        WHERE job_key = $1
        `,
        [jobKey, JOB_STATUS.SYNCED],
    );
}

async function markJobFailure(jobKey, attempts, errorMessage) {
    const nextAttemptAt = new Date(Date.now() + getRetryDelayMs(attempts));
    await pool.query(
        `
        UPDATE canonical_sync_jobs
        SET status = $2,
            next_attempt_at = $3,
            last_error = $4,
            updated_at = now()
        WHERE job_key = $1
        `,
        [jobKey, JOB_STATUS.FAILED, nextAttemptAt, errorMessage],
    );
}

async function pickJobs(whereClause = "TRUE", params = [], limit = 10) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `
            WITH picked AS (
                SELECT job_key
                FROM canonical_sync_jobs
                WHERE ${whereClause}
                ORDER BY next_attempt_at ASC
                LIMIT $${params.length + 1}
                FOR UPDATE SKIP LOCKED
            )
            UPDATE canonical_sync_jobs jobs
            SET status = $${params.length + 2},
                attempts = jobs.attempts + 1,
                updated_at = now()
            FROM picked
            WHERE jobs.job_key = picked.job_key
            RETURNING jobs.*
            `,
            [...params, limit, JOB_STATUS.PROCESSING],
        );
        await client.query("COMMIT");
        return rows;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function processCanonicalSyncJob(jobKey) {
    const rows = await pickJobs("job_key = $1", [jobKey], 1);
    const job = rows[0];
    if (!job) {
        return { ok: true, processed: false };
    }

    try {
        await deliverCanonicalSyncJob(job);
        await markJobSuccess(job.job_key);
        return { ok: true, processed: true };
    } catch (error) {
        const message = getErrorMessage(error);
        await markJobFailure(job.job_key, job.attempts, message);
        logger.error({ err: error, jobKey: job.job_key }, "canonical sync delivery failed");
        return { ok: false, processed: true, error };
    }
}

export async function processPendingCanonicalSyncJobs(limit = 10) {
    const processingCutoff = new Date(Date.now() - PROCESSING_STALE_MS);
    const rows = await pickJobs(
        "(status IN ($1, $2) AND next_attempt_at <= now()) OR (status = $3 AND updated_at < $4)",
        [JOB_STATUS.PENDING, JOB_STATUS.FAILED, JOB_STATUS.PROCESSING, processingCutoff],
        limit,
    );

    for (const job of rows) {
        try {
            await deliverCanonicalSyncJob(job);
            await markJobSuccess(job.job_key);
        } catch (error) {
            const message = getErrorMessage(error);
            await markJobFailure(job.job_key, job.attempts, message);
            logger.error({ err: error, jobKey: job.job_key }, "canonical sync retry failed");
        }
    }
}

let workerHandle = null;

export function startCanonicalSyncWorker() {
    if (workerHandle) {
        return workerHandle;
    }

    workerHandle = setInterval(() => {
        void processPendingCanonicalSyncJobs().catch((error) => {
            logger.error({ err: error }, "canonical sync worker crashed");
        });
    }, 5000);

    workerHandle.unref?.();
    return workerHandle;
}
