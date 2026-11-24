-- Idempotent upgrade for databases created before job_chunks (job_id, chunk_index) uniqueness.
-- Required for INSERT ... ON CONFLICT (job_id, chunk_index) in job-service.
--
-- If CREATE UNIQUE INDEX fails with a duplicate-key error, remove duplicate rows first
-- (keep one row per pair), then re-run.

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_chunks_job_chunk ON job_chunks(job_id, chunk_index);
