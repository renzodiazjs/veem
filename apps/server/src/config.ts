import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface SessionConfig {
  id: string;
  title: string;
  room: string;
  speaker?: string;
  /** BCP-47 code of the spoken language, e.g. "en-US" */
  language: string;
  /** Technical Context Engine: terms that bias recognition and are preserved in translation */
  glossary: string[];
  source: { type: "file"; path: string; loop?: boolean; startAtSec?: number };
  autostart?: boolean;
}

export interface ConferenceConfig {
  name: string;
  sessions: SessionConfig[];
}

export function loadConfig(path = process.env.SESSIONS_FILE ?? resolve(process.cwd(), "../../sessions.json")): ConferenceConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ConferenceConfig;
  const base = dirname(path);
  const ids = new Set<string>();
  for (const s of raw.sessions) {
    if (ids.has(s.id)) throw new Error(`Duplicate session id "${s.id}" in ${path}`);
    ids.add(s.id);
    s.language ??= "en-US";
    s.glossary ??= [];
    s.source.path = resolve(base, s.source.path);
  }
  return raw;
}
