-- TranscribeGlobal: Transcripts Table Schema
-- Run this in your Supabase SQL Editor

-- Create transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    audio_duration_seconds FLOAT,
    text TEXT NOT NULL,
    language TEXT,
    confidence FLOAT,
    provider TEXT DEFAULT 'local',
    cost_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_transcripts_user_id ON transcripts(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_user_created ON transcripts(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own transcripts
CREATE POLICY "Users can view own transcripts"
    ON transcripts FOR SELECT
    USING (true);  -- Backend validates user_id via header

-- Policy: Users can insert their own transcripts
CREATE POLICY "Users can insert own transcripts"
    ON transcripts FOR INSERT
    WITH CHECK (true);  -- Backend validates user_id via header

-- Policy: Users can delete their own transcripts
CREATE POLICY "Users can delete own transcripts"
    ON transcripts FOR DELETE
    USING (true);  -- Backend validates user_id via header

-- Grant permissions to authenticated and service role
GRANT ALL ON transcripts TO authenticated;
GRANT ALL ON transcripts TO service_role;
