// Quick regression checks for the sentence segmenter (node:test).
// Run: pnpm --filter @veem/server test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SentenceSegmenter } from "../src/SentenceSegmenter";

test("commits a sentence once text follows it", () => {
  const s = new SentenceSegmenter();
  assert.deepEqual(s.interim("Welcome to Nerdearla.").commits, []);
  assert.deepEqual(s.interim("Welcome to Nerdearla. Today we").commits, ["Welcome to Nerdearla."]);
});

test("does not re-commit when the interim window trims its start", () => {
  const s = new SentenceSegmenter();
  s.interim("Welcome to Nerdearla. Today we will talk about Kubernetes. And");
  const r = s.interim("to Nerdearla. Today we will talk about Kubernetes. And eBPF.");
  assert.deepEqual(r.commits, []);
});

test("final does not duplicate already committed sentences", () => {
  const s = new SentenceSegmenter();
  s.interim("Hello, thank you for joining me. for my talk");
  const r = s.final("Hello, thank you for joining me. for my talk, Data Modeling for Software Engineers.");
  assert.deepEqual(r.commits, ["for my talk, Data Modeling for Software Engineers."]);
});

test("final rewording of a committed sentence is skipped", () => {
  const s = new SentenceSegmenter();
  s.interim("Because it's about getting your engineering leaders to smile again. So");
  assert.deepEqual(s.final("engineering leaders to smile again.").commits, []);
});

test("short sentence sharing common words with a previous one is kept", () => {
  const s = new SentenceSegmenter();
  s.interim("So I'm, you know, I'm familiar with what we're going to talk about today. I also");
  assert.deepEqual(s.final("I also do speaking. Obviously, I'm here today.").commits, ["I also do speaking.", "Obviously, I'm here today."]);
});
