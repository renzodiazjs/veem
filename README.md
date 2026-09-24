# veem

**Open-source accessibility infrastructure for live conferences.**
Real-time transcription and English → Spanish captions for every stage at once, on any phone, with no app and no login.

> Built during the [Nerdearla](https://nerdear.la) 2026 Vibeathon (24–25 Sep 2026).

---

## Why

Conferences want every talk to be accessible, but live captioning usually means one human captioner per room, one language, and a price that doesn't scale past the main stage. veem treats captions as infrastructure: one server runs every room in parallel, each room is a line of config, and the audience just scans a QR code.

## What it does

| | |
|---|---|
| **Live transcription** | Speech → English captions with interim text every ~0.5 s |
| **Live translation** | English → Spanish, sentence by sentence, without waiting for the speaker to pause |
| **N rooms in parallel** | Each stage is a `LiveSession`; adding one is an entry in `sessions.json` |
| **Technical Context Engine** | Per-talk glossary (speaker, products, jargon) biases recognition *and* is preserved in translation. Built-in live A/B view shows the same audio transcribed with and without context |
| **Measured latency** | End of speech → caption p50/p95 per room, measured, not claimed |
| **Control Center** | Health, latency, reconnects, segments, QR and exports for every room |
| **QR access** | Each room gets a QR pointing to its captions page on the local network |
| **Accessibility pack** | Download `.vtt`, `.srt` and `.txt` in English and Spanish |
| **Resilience** | Provider reconnects with backoff, proactive 9-minute connection rotation, clients re-sync from a snapshot |

## Screens

| Route | For |
|---|---|
| `/` | Lobby: pick your room |
| `/session/:id` | Audience captions: ES/EN toggle, font size, mobile-first, high contrast |
| `/control` | Organizers: every room's health, latency, QR and exports |
| `/session/:id/compare` | Technical Context Engine A/B, same audio with and without context |

## Architecture

```
                         sessions.json  (one entry per stage)
                                │
                          SessionManager
            ┌───────────────────┼───────────────────┐
       LiveSession A       LiveSession B       LiveSession N
            │
   AudioSource (ffmpeg, real-time paced PCM16 16 kHz)
            │
            ├─► SpeechEndDetector (local RMS)  ──► latency reference
            │
            ▼
   GeminiTranscriber  ── gemini-3.5-transcribe-live (customVocabulary = glossary)
            │  interim / final text
            ▼
   SentenceSegmenter  ── commits stable sentences early, dedupes by content
            │
            ├─► EN segment ─────────────────────────────┐
            ▼                                           │
   Translator ── Claude Haiku 4.5 (glossary-aware)      │
            │   └─ fallback: Gemini Flash-Lite          │
            ▼                                           ▼
         ES text ────────────► WebSocket /ws ◄──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
           Audience views     Control Center     A/B compare
```

**Key decisions**

- **Transcribe with Gemini Live, translate with a text LLM.** A dedicated transcription model gives low-latency interim/final events plus a `customVocabulary` field. Translating finalized text separately means English captions never wait on translation.
- **Sentence-level translation.** Gemini only emits a "final" at speech pauses, which can be 15+ seconds of continuous speech. We commit a sentence as soon as more text follows its punctuation, so Spanish follows English by about a second instead of a whole utterance.
- **Deduplicate by content, not position.** Gemini's interim text is a sliding window and finals can reword or merge interims. Sentences are matched by word-bigram overlap against recent commits, and only the novel part of an extended sentence is shown. Covered by tests: `pnpm --filter @veem/server test`.
- **One WebSocket server, state in memory.** Captions don't round-trip through a database. Clients get a full snapshot on (re)connect, and slow clients have interim updates dropped (backpressure).

## Quick start

Requirements: Node 22+, pnpm, ffmpeg, and optionally yt-dlp for the demo audio.

```bash
git clone https://github.com/renzodiazjs/veem.git
cd veem
cp .env.example .env          # add your keys, see below
pnpm install
node scripts/fetch-demo-audio.mjs   # downloads 3 public Nerdearla talks into ./media
pnpm dev                      # server :8080, web :3100
```

Open **http://localhost:3100/control**, press **Iniciar** on any room, and open its captions.

### With Docker

```bash
cp .env.example .env          # required: compose reads it; set PUBLIC_HOST to your LAN IP for QR codes
node scripts/fetch-demo-audio.mjs
docker compose up --build
```

`sessions.json` and `./media` are mounted into the server container, so rooms and audio can change without a rebuild.

## Models & credentials

| Variable | Used for | Required |
|---|---|---|
| `GEMINI_API_KEY` | Live transcription (`gemini-3.5-transcribe-live`), translation fallback | Yes, from [Google AI Studio](https://aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | EN→ES translation (`claude-haiku-4-5`) | Recommended. Without it, translation uses Gemini Flash-Lite |
| `GEMINI_STT_MODEL`, `GEMINI_MT_MODEL`, `ANTHROPIC_MT_MODEL` | Override model IDs | No |
| `SPEECH_RMS_THRESHOLD` | Speech detection threshold for latency measurement (default 500) | No |
| `PUBLIC_HOST` | Host used in QR codes (default: the machine's LAN IP) | No |

Keys live only on the server and never reach the browser.

## Adding a room

Every stage is one entry in [`sessions.json`](sessions.json):

```json
{
  "id": "auditorium-c",
  "title": "Server-Side WebAssembly",
  "room": "Auditorium C",
  "speaker": "Ramón Huidobro",
  "language": "en-US",
  "glossary": ["WebAssembly", "Wasm", "WASI", "Wasmtime", "Solomon Hykes"],
  "source": { "type": "file", "path": "media/talk-c.wav", "startAtSec": 685 },
  "compareBaseline": true
}
```

- `glossary`: the talk's context. Names, products and acronyms get recognized correctly and are kept untranslated.
- `source.path`: any file ffmpeg can read. It is streamed at real-time speed to simulate a live feed.
- `compareBaseline`: also runs a context-free transcription on the same audio for the A/B view. It doubles the STT cost, so enable it only where you want to show it.

## How it scales

- **Per room:** 1 Gemini Live connection (2 with `compareBaseline`), 1 translation call per sentence, and about 3.2 KB/s of audio upstream.
- **The server is I/O bound.** Audio decoding runs in an ffmpeg child process, everything else is small JSON, and a single Node process comfortably drives many rooms.
- **Viewers are cheap.** Each viewer is one WebSocket receiving a few small messages per second, and slow viewers are shed from interim updates.
- **Beyond one process:** sessions share nothing, so you can shard by room (e.g. one container per group of stages, each with its own `sessions.json`). The practical ceiling is the provider's concurrent-session quota, not the server.
- **Long talks:** transcription connections rotate every 9 minutes (the model caps sessions at about 10 minutes), overlapping the old and new connection so no speech is lost.

## Latency: what we measure

The Control Center reports, per room:

- **Habla → EN / Habla → ES (p50, p95):** from the moment the speaker stopped talking, detected locally from audio energy at the start of a ≥300 ms pause, to the English caption and the Spanish caption being ready on the server.
- **Traducción:** the translation round-trip for every sentence.

Measured on real Nerdearla talks, 2 rooms in parallel: **speech end → EN ≈ 1.8 s p50**, **speech end → ES ≈ 2.8 s p50 / 3.1 s p95**, translation ≈ 0.9 s p50.

This is measured at utterance ends, where "the speech ended" is observable. Mid-utterance sentences are usually faster, because they are committed while the speaker is still talking. Browser render time (a few ms on the LAN) is not included.

## Demo audio

The demo uses public talks from the [Nerdearla YouTube channel](https://www.youtube.com/@Nerdearla):

- *Human-Centric Engineering: Purpose Over KPIs*, Ben Popplestone
- *Data Modeling for Software Engineers*, Scott Sosna
- *Server-Side WebAssembly: The Post-Container Revolution is Here!*, Ramón Huidobro

The audio is **not redistributed** in this repo, because it remains under its original YouTube license. `scripts/fetch-demo-audio.mjs` downloads it locally with yt-dlp.

## Known limitations

- **Input is a file streamed in real time.** Microphone, RTMP and SRT ingest are not implemented yet, but the `AudioSource` interface is where they plug in.
- **Caption timestamps in exports are estimated.** Gemini Live returns no word timings, so sentences are laid out on the audio timeline by word count, anchored at measured speech ends.
- **Transcription depends on Gemini Live availability.** During development we saw `1011 Internal error` closes and `503` overload responses. veem reconnects automatically, but it can't transcribe while the provider is down. A paid tier is recommended for real events.
- **State is in memory.** A server restart clears the current transcripts. Exports should be downloaded before restarting.
- **Only EN → ES.** The translator is language-agnostic, but the UI and prompts target Spanish.
- **The A/B term counter counts glossary mentions.** It is not a word-error rate, since there is no human reference transcript.

## Development

```bash
pnpm dev                              # server + web
pnpm --filter @veem/server test       # segmenter regression tests
pnpm --filter @veem/server e2e 60     # start all rooms, print captions + latency for 60 s
```

## License

[Apache-2.0](LICENSE)
