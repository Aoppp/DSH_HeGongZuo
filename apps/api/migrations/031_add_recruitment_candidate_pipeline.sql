ALTER TABLE recruitment_candidates
  ADD COLUMN IF NOT EXISTS candidate_stage varchar(24) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS candidate_notes text NOT NULL DEFAULT '';

ALTER TABLE recruitment_candidates DROP CONSTRAINT IF EXISTS recruitment_candidates_candidate_stage_check;
ALTER TABLE recruitment_candidates ADD CONSTRAINT recruitment_candidates_candidate_stage_check
  CHECK (candidate_stage IN ('none', 'to_contact', 'interview_scheduled', 'interviewing', 'pending_offer', 'hired', 'declined'));

CREATE INDEX IF NOT EXISTS recruitment_candidates_candidate_stage_idx
  ON recruitment_candidates(candidate_stage, updated_at DESC);
