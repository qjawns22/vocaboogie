import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL("../public/legacy/compose-feedback.js", import.meta.url), "utf8"), context);
const evaluate = context.window.WordkitComposeFeedback;

test("fixes common beginner forms and punctuation without changing the intended word", () => {
  const result = evaluate("i is happy to go", { term: "go", example: "I want to go home." });
  assert.equal(result.suggestion, "I am happy to go.");
  assert.equal(result.usedTerm, true);
  assert.match(result.title, /다듬어/);
});

test("recognizes an inflected target word", () => {
  const result = evaluate("I bought a new bag.", { term: "buy", example: "I want to buy a bag." });
  assert.equal(result.usedTerm, true);
  assert.equal(result.tone, "good");
});

test("offers the saved example when the target word is absent", () => {
  const result = evaluate("The movie was fun.", { term: "take a day off", example: "I need to take a day off." });
  assert.equal(result.usedTerm, false);
  assert.equal(result.suggestion, "I need to take a day off.");
  assert.equal(result.tone, "review");
});

test("does not treat a different valid sentence as an exact example match", () => {
  const result = evaluate("I will help you out.", { term: "help out", example: "Can you help me out?" });
  assert.equal(result.usedTerm, true);
  assert.notEqual(result.title, "예문과 잘 맞아요!");
});
