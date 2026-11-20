-- Migration: Deduplicate repo_analyses and enforce strict 1-to-1 canonical repository uniqueness
-- Keeps the most recent analysis per repository and prevents duplicate cache rows

-- 1. Deduplicate existing rows in public.repo_analyses keeping only the latest per repo_full_name
DELETE FROM public.repo_analyses
WHERE id NOT IN (
  SELECT DISTINCT ON (LOWER(repo_full_name)) id
  FROM public.repo_analyses
  ORDER BY LOWER(repo_full_name), created_at DESC
);

-- 2. Drop old composite constraint that allowed duplicate repositories with different commits
ALTER TABLE public.repo_analyses
  DROP CONSTRAINT IF EXISTS uq_repo_commit;

-- 3. Enforce strict 1-to-1 canonical repository uniqueness
ALTER TABLE public.repo_analyses
  ADD CONSTRAINT uq_repo_analyses_repo_full_name UNIQUE (repo_full_name);
