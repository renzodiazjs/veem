import type { ConferenceConfig } from "./config";
import { LiveSession } from "./LiveSession";
import type { Translator } from "./providers/Translator";

/** Owns every LiveSession. Adding a stage = adding an entry to sessions.json. */
export class SessionManager {
  private readonly sessions = new Map<string, LiveSession>();

  constructor(readonly conference: ConferenceConfig, translator: Translator) {
    for (const cfg of conference.sessions) this.sessions.set(cfg.id, new LiveSession(cfg, translator));
  }

  list() {
    return [...this.sessions.values()].map((s) => s.summary());
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  startAutostart() {
    for (const cfg of this.conference.sessions) if (cfg.autostart) this.sessions.get(cfg.id)!.start();
  }

  stopAll() {
    for (const s of this.sessions.values()) s.stop();
  }
}
