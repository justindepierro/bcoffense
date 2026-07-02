-- Migration 0003: Account lockout columns
-- Adds brute-force lockout tracking to users table.
-- The sessions table was already created in 0001_initial_schema.sql.

ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lockout_until INTEGER; -- unix timestamp; NULL = not locked
