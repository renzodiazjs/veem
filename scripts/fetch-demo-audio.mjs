#!/usr/bin/env node
// Downloads the demo talks (public Nerdearla YouTube videos) and converts them
// to 16 kHz mono WAV in ./media. Audio is NOT redistributed in this repo —
// it stays under its original YouTube license.
//
// Requires: yt-dlp (pip install yt-dlp) and ffmpeg on PATH.
// Usage: node scripts/fetch-demo-audio.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TALKS = [
  { file: "talk-a", url: "https://www.youtube.com/watch?v=7rteJoZSSzo" }, // Human-Centric Engineering — Ben Popplestone
  { file: "talk-b", url: "https://www.youtube.com/watch?v=GVadbxHks_A" }, // Data Modeling for Software Engineers — Scott Sosna
  { file: "talk-c", url: "https://www.youtube.com/watch?v=JjPKfcmjKtk" }, // Server-Side WebAssembly — Ramón Huidobro (Context Engine demo)
];

const media = join(import.meta.dirname, "..", "media");
mkdirSync(media, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
}

const ytdlp = run("yt-dlp", ["--version"]) ? ["yt-dlp"] : ["python", "-m", "yt_dlp"];

for (const t of TALKS) {
  const wav = join(media, `${t.file}.wav`);
  if (existsSync(wav)) {
    console.log(`✓ ${wav} already exists`);
    continue;
  }
  const tmp = join(media, `${t.file}.download`);
  console.log(`↓ ${t.url}`);
  if (!run(ytdlp[0], [...ytdlp.slice(1), "-f", "bestaudio", "-o", `${tmp}.%(ext)s`, t.url])) process.exit(1);
  const downloaded = ["webm", "m4a", "opus", "mp3"].map((e) => `${tmp}.${e}`).find(existsSync);
  if (!downloaded || !run("ffmpeg", ["-loglevel", "error", "-y", "-i", downloaded, "-ar", "16000", "-ac", "1", wav])) process.exit(1);
  rmSync(downloaded);
  console.log(`✓ ${wav}`);
}
