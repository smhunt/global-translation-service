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
- `GET /api/v1/transcribe/status` - Service status
- `POST /api/v1/transcribe/audio` - Upload audio for transcription

## Tech Stack

### Frontend
- **Framework**: Next.js 16 with App Router
- **UI**: shadcn/ui + Tailwind CSS v4
- **Components**: Button, Card, Input, Textarea (installed)

### Backend
- **API Server**: FastAPI with Pydantic v2
- **CORS**: Configured for frontend access

### Planned Integrations
- **Local Runtime**: Ollama for on-device inference
- **ASR**: Whisper/Distil-Whisper
- **Database**: Supabase (Postgres)
- **Auth**: Clerk

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
