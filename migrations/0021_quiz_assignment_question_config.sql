-- Coach-authored assignment configuration. Existing assignments keep their
-- original behavior through safe empty-array defaults.

ALTER TABLE quiz_assignments ADD COLUMN question_types_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE quiz_assignments ADD COLUMN custom_questions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE quiz_assignments ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'playbook';
ALTER TABLE quiz_assignments ADD COLUMN source_id TEXT;
