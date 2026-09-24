# veem

**Open-source accessibility infrastructure for live conferences.**
Real-time transcription + EN→ES translated captions for many simultaneous stages.

> Built during the Nerdearla 2026 Vibeathon.

## Architecture
```
AudioSource → LiveSession → SpeechProvider (Gemini Live) → Translator (Claude Haiku) → WebSocket → Audience / Control Center
```

## Quick start (dev)
```bash
cp .env.example .env   # add GEMINI_API_KEY and ANTHROPIC_API_KEY
pnpm install
pnpm dev               # server :8080, web :3000
```

## Status
Work in progress — see commits.

## License
Apache-2.0 — see [LICENSE](LICENSE).
