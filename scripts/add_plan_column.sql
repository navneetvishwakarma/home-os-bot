-- Phase 5: Add plan column to households
-- Run this in the Supabase SQL Editor for existing deployments.
-- New deployments should include this in create_schema.sql instead.

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
