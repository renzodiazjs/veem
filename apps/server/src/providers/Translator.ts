import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export interface TranslateRequest {
  text: string;
  /** Previous English sentences, for coherence across sentence boundaries */
  context: string[];
  glossary: string[];
  talkTitle?: string;
}

export interface Translator {
  readonly name: string;
  translate(req: TranslateRequest): Promise<string>;
}

function systemPrompt(req: TranslateRequest) {
  return [
    "You translate live conference captions from English to neutral Latin American Spanish.",
    "Output ONLY the Spanish translation of the new sentence. No quotes, no notes.",
    req.talkTitle ? `Talk: "${req.talkTitle}".` : "",
    req.glossary.length
      ? `Technical glossary — keep these terms exactly as written, never translate or respell them: ${req.glossary.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function userPrompt(req: TranslateRequest) {
  const ctx = req.context.length ? `Previous sentences (context only, do not translate):\n${req.context.join(" ")}\n\n` : "";
  return `${ctx}New sentence:\n${req.text}`;
}

export class ClaudeTranslator implements Translator {
  readonly name = "claude-haiku-4.5";
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async translate(req: TranslateRequest) {
    const r = await this.client.messages.create({
      model: process.env.ANTHROPIC_MT_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt(req),
      messages: [{ role: "user", content: userPrompt(req) }],
    });
    const block = r.content[0];
    return block?.type === "text" ? block.text.trim() : "";
  }
}

export class GeminiTranslator implements Translator {
  readonly name = "gemini-flash-lite";
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async translate(req: TranslateRequest) {
    const r = await this.ai.models.generateContent({
      model: process.env.GEMINI_MT_MODEL ?? "gemini-3.5-flash-lite",
      contents: userPrompt(req),
      config: { systemInstruction: systemPrompt(req) },
    });
    return (r.text ?? "").trim();
  }
}

/** Tries each translator in order; first success wins. */
export class FallbackTranslator implements Translator {
  readonly name: string;
  constructor(private readonly chain: Translator[]) {
    this.name = chain.map((t) => t.name).join(" → ");
  }

  async translate(req: TranslateRequest) {
    let lastErr: unknown;
    for (const t of this.chain) {
      try {
        return await t.translate(req);
      } catch (err) {
        lastErr = err;
        console.warn(`[translator] ${t.name} failed:`, (err as Error).message);
      }
    }
    throw lastErr;
  }
}

export function createTranslator(): Translator {
  const chain: Translator[] = [];
  if (process.env.ANTHROPIC_API_KEY) chain.push(new ClaudeTranslator());
  if (process.env.GEMINI_API_KEY) chain.push(new GeminiTranslator());
  return new FallbackTranslator(chain);
}
