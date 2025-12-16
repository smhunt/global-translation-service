# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TranscribeGlobal is a decentralized, privacy-first AI transcription platform. The project aims to provide offline-capable transcription using local models, blockchain for crowdsourced language data, and support for 1,600+ languages.

## Project Structure

```
global-translation-service/
├── frontend/          # Next.js 16 + shadcn/ui + Tailwind CSS
│   └── src/
│       ├── app/       # App router pages
│       ├── components/ui/  # shadcn components
│       └── lib/       # Utilities
├── backend/           # FastAPI Python API
│   ├── app/
│   │   ├── api/       # Route handlers
│   │   ├── core/      # Config, settings
│   │   ├── models/    # Pydantic models
│   │   └── services/  # Business logic
│   └── venv/          # Python virtual environment
└── docs/              # Spec documents
```

## Development Commands

### Frontend (Next.js)
```bash
cd frontend
npm run dev          # Dev server on port 3010
npm run build        # Production build
npm run lint         # ESLint
```

### Backend (FastAPI)
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 3085
```

### Add shadcn components
```bash
cd frontend
npx shadcn@latest add [component-name]
```

## Port Assignments

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3010 | http://10.10.10.24:3010 |
| Backend API | 3085 | http://10.10.10.24:3085 |
| API Docs | 3085 | http://10.10.10.24:3085/docs |

## API Endpoints

- `GET /` - API info
- `GET /health` - Health check
- `GET /api/v1/transcribe/status` - Service status (model, cloud availability)
- `POST /api/v1/transcribe/audio` - Sync transcription (returns result immediately)
- `POST /api/v1/transcribe/start` - Start async transcription job
- `GET /api/v1/transcribe/progress/{job_id}` - SSE stream for real-time progress
- `GET /api/v1/transcribe/job/{job_id}` - Get job status (non-streaming)

## Tech Stack

### Frontend
- **Framework**: Next.js 16 with App Router
- **UI**: shadcn/ui + Tailwind CSS v4
- **Auth**: Clerk (sign-in/sign-up with protected routes)
- **Features**: Drag-drop upload, real-time progress, copy/download transcript

### Backend
- **API Server**: FastAPI with Pydantic v2
- **ASR**: faster-whisper (local) + OpenAI Whisper API (cloud fallback)
- **Task Queue**: Celery + Redis (optional, for distributed processing)
- **CORS**: Configured for frontend access

### Implemented
- **Local Transcription**: faster-whisper with real-time progress
- **Cloud Fallback**: OpenAI Whisper API integration
- **Provider Comparison**: Side-by-side local vs cloud results
- **Cost Tracking**: Real-time cost savings calculation
- **Auth**: Clerk with middleware protection

### Planned
- **Database**: Supabase (Postgres) for transcript history
- **Export**: SRT/VTT subtitle formats

## Network Access

Always use LAN IP (not localhost) for phone testing:
```bash
ipconfig getifaddr en0  # Get current LAN IP: 10.10.10.24
```

## Architecture

The platform uses a hybrid local-cloud approach:
1. **Privacy-first**: Local models via Ollama handle sensitive transcription
2. **Fallback**: Cloud inference for rare languages or high load
3. **Decentralized data**: Crowdsourced voice data validated on-chain
