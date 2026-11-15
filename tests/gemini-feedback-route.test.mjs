import { test } from "node:test";
import assert from "node:assert/strict";

test("validates submission input and GET correctly", async () => {
  const { GET, POST } = await import("../app/api/compose-feedback/route.ts");

  // Test GET
  const getReq = new Request("http://localhost:3000/api/compose-feedback");
  const getRes = await GET(getReq);
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.provider, "google-gemini");
  assert.equal(getData.configured, true);
  assert.equal(getData.hasServerKey, true);

  // Test POST with empty answer
  const postReqEmpty = new Request("http://localhost:3000/api/compose-feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      answer: "",
      prompt: "오늘 점심은 내가 살게.",
      term: "it's on me",
      meaning: "내가 낼게",
      example: "Lunch is on me today."
    })
  });

  const resEmpty = await POST(postReqEmpty);
  assert.equal(resEmpty.status, 400);
});

test("successfully parses Gemini API output and formats feedback", async () => {
  const originalFetch = globalThis.fetch;

  // Mock fetch to simulate Gemini response
  globalThis.fetch = async (url) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    verdict: "good",
                    feedback: "단어를 아주 자연스럽게 활용하여 문장을 잘 완성하셨습니다!",
                    correctedSentence: "Lunch is on me today.",
                    tips: ["구어체 표현을 알맞게 적용했습니다."],
                    targetUsed: true
                  })
                }
              ]
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const { POST } = await import("../app/api/compose-feedback/route.ts");
    const req = new Request("http://localhost:3000/api/compose-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        answer: "lunch is on me today",
        prompt: "오늘 점심은 내가 살게.",
        term: "it's on me",
        meaning: "내가 낼게",
        example: "Lunch is on me today."
      })
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.feedback.source, "gemini");
    assert.equal(body.feedback.tone, "good");
    assert.equal(body.feedback.suggestion, "Lunch is on me today.");
    assert.equal(body.feedback.usedTerm, true);
    assert.equal(body.feedback.notes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handles Gemini API error responses cleanly", async () => {
  const originalFetch = globalThis.fetch;

  // Mock fetch to simulate Gemini quota limit
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: 429,
          message: "Resource has been exhausted (e.g. check quota)."
        }
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const { POST } = await import("../app/api/compose-feedback/route.ts");
    const req = new Request("http://localhost:3000/api/compose-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        answer: "I go to store.",
        prompt: "나는 가게에 가.",
        term: "go",
        meaning: "가다",
        example: "I go to school."
      })
    });

    const res = await POST(req);
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.code, "quota_exceeded");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
