-- CreateTable
CREATE TABLE "blog_page_state" (
    "blog_id" UUID NOT NULL,
    "yjs_state" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_page_state_pkey" PRIMARY KEY ("blog_id")
);

-- CreateTable
CREATE TABLE "docs_page_state" (
    "docs_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "yjs_state" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docs_page_state_pkey" PRIMARY KEY ("page_id")
);

-- CreateTable
CREATE TABLE "docs_sidebar_state" (
    "docs_id" UUID NOT NULL,
    "yjs_state" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docs_sidebar_state_pkey" PRIMARY KEY ("docs_id")
);

-- CreateTable
CREATE TABLE "canonical_sync_jobs" (
    "id" BIGSERIAL NOT NULL,
    "job_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "docs_page_state_docs_id_idx" ON "docs_page_state"("docs_id");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_sync_jobs_job_key_key" ON "canonical_sync_jobs"("job_key");
