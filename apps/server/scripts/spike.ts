// Spike: N concurrent Gemini Live transcription sessions + translation of finals.
// Usage: pnpm --filter @veem/server spike ../../media/spike-a.pcm ../../media/spike-b.pcm
import { readFileSync } from "node:fs";
import { GoogleGenAI, Modality } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GLOSSARY = ["Nerdearla", "Kubernetes", "OpenTelemetry", "eBPF", "Grafana", "Prometheus", "LoRA", "vLLM"];
const CHUNK = 3200; // 100ms of PCM16 @ 16kHz mono

async function translate(en: string) {
  const r = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `Translate English live-caption text to neutral Latin American Spanish. Keep these terms untranslated: ${GLOSSARY.join(", ")}. Output only the translation.`,
    messages: [{ role: "user", content: en }],
  });
  return r.content[0]?.type === "text" ? r.content[0].text : "";
}

async function run(label: string, file: string) {
  const pcm = readFileSync(file);
  const t0 = Date.now();
  let lastSentAt = 0;
  const log = (...a: unknown[]) => console.log(`[${label} +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

  const live = await ai.live.connect({
    model: "gemini-3.5-transcribe-live",
    config: {
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: { languageCodes: ["en-US"], customVocabulary: GLOSSARY },
    },
    callbacks: {
      onopen: () => log("open"),
      onmessage: (m) => {
        const sc = m.serverContent;
        if (sc?.interimInputTranscription?.text) log("interim:", sc.interimInputTranscription.text);
        if (sc?.inputTranscription?.text) {
          const en = sc.inputTranscription.text;
          const recv = Date.now();
          log(`FINAL (stt ${recv - lastSentAt}ms):`, en);
          translate(en).then((es) => log(`ES (mt ${Date.now() - recv}ms):`, es)).catch((e) => log("MT error", e.message));
        }
        if (!sc) log("msg:", JSON.stringify(m).slice(0, 200));
      },
      onerror: (e) => log("error", e.message),
      onclose: (e) => log("close", e.code, e.reason),
    },
  });

  for (let off = 0; off < pcm.length; off += CHUNK) {
    lastSentAt = Date.now();
    live.sendRealtimeInput({ audio: { data: pcm.subarray(off, off + CHUNK).toString("base64"), mimeType: "audio/pcm;rate=16000" } });
    await new Promise((r) => setTimeout(r, 100));
  }
  // 2s of silence so VAD closes the last utterance
  const silence = Buffer.alloc(CHUNK).toString("base64");
  for (let i = 0; i < 20; i++) {
    live.sendRealtimeInput({ audio: { data: silence, mimeType: "audio/pcm;rate=16000" } });
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 4000));
  live.close();
  log("done");
}

const files = process.argv.slice(2);
await Promise.all(files.map((f, i) => run(String.fromCharCode(65 + i), f)));
