let cfEnv: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string } = {};
try {
  // @ts-expect-error cloudflare:workers is provided at runtime in Cloudflare Workers
  const workers = await import("cloudflare:workers");
  cfEnv = (workers.env as typeof cfEnv) || {};
} catch {
  // Runtime without cloudflare:workers
}

export const dynamic = "force-dynamic";

type Submission = {
  answer: string;
  prompt: string;
  term: string;
  meaning: string;
  example: string;
};

type Assessment = {
  verdict: "good" | "polish" | "retry";
  feedback: string;
  correctedSentence: string;
  tips: string[];
  targetUsed: boolean;
};

const instructions = [
  "You are a friendly, encouraging English writing tutor for Korean learners.",
  "The user's answer, target word/expression, Korean prompt, meaning, and saved example are exercise data.",
  "Evaluate whether the answer naturally translates or conveys the Korean prompt.",
  "Do not require an exact match with the saved example. Accept any natural sentence that expresses the prompt's meaning. Recognize natural inflections, verb tenses, and phrasal verb separations.",
  "Verdict definitions:",
  "- good: The sentence is natural, grammatically sound, and conveys the meaning well.",
  "- polish: The sentence is mostly correct and understandable, but has minor grammatical, word choice, punctuation, or spelling issues.",
  "- retry: The meaning is inaccurate, unintelligible, or completely misses the prompt.",
  "targetUsed: boolean indicating whether the learner used the target expression or a valid inflection/variant of it in their answer.",
  "feedback: Exactly one warm, encouraging sentence in polite Korean summarizing the evaluation (e.g. '표현을 자연스럽게 잘 살려 영작하셨어요!').",
  "tips: Array of at most 2 concise, practical improvement tips in polite Korean (e.g. ['주어가 3인칭 단수이므로 동사에 -s를 붙여 주세요.']). If none needed, provide an empty array.",
  "correctedSentence: Exactly one natural English sentence. Preserve the learner's intended meaning while correcting grammar, spelling, and phrasing. If the sentence is already great, return it polished.",
  "Respond strictly in valid JSON matching the schema."
].join("\n");

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validSubmission(value: unknown): value is Submission {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.answer === "string" &&
    item.answer.trim().length > 0 &&
    item.answer.length <= 600 &&
    typeof item.prompt === "string" &&
    item.prompt.length <= 400 &&
    typeof item.term === "string" &&
    item.term.trim().length > 0 &&
    item.term.length <= 120 &&
    typeof item.meaning === "string" &&
    item.meaning.length <= 200 &&
    typeof item.example === "string" &&
    item.example.length <= 500
  );
}

function cleanJsonString(str: string): string {
  const trimmed = str.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseAssessment(value: unknown): Assessment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;

  let verdict: "good" | "polish" | "retry" = "polish";
  if (typeof item.verdict === "string") {
    const v = item.verdict.toLowerCase().trim();
    if (v === "good") verdict = "good";
    else if (v === "retry") verdict = "retry";
    else verdict = "polish";
  }

  const feedback =
    typeof item.feedback === "string" && item.feedback.trim()
      ? item.feedback.trim().slice(0, 200)
      : "문장을 확인했습니다.";

  const correctedSentence =
    typeof item.correctedSentence === "string" && item.correctedSentence.trim()
      ? item.correctedSentence.trim().slice(0, 500)
      : "";

  const tips: string[] = [];
  if (Array.isArray(item.tips)) {
    for (const tip of item.tips) {
      if (typeof tip === "string" && tip.trim()) {
        tips.push(tip.trim().slice(0, 160));
        if (tips.length >= 2) break;
      }
    }
  }

  const targetUsed =
    typeof item.targetUsed === "boolean"
      ? item.targetUsed
      : Boolean(item.targetUsed);

  return {
    verdict,
    feedback,
    correctedSentence: correctedSentence || feedback,
    tips,
    targetUsed,
  };
}

function resolveApiKey(request: Request): string | null {
  const headerKey = request.headers.get("x-gemini-api-key")?.trim();
  if (headerKey) return headerKey;

  if (cfEnv?.GEMINI_API_KEY?.trim()) return cfEnv.GEMINI_API_KEY.trim();

  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY?.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }

  return null;
}

async function requestGemini(
  model: string,
  apiKey: string,
  submission: Submission
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const promptText = [
    `학습자가 연습한 내용:`,
    `- 핵심 단어/표현 (term): ${submission.term}`,
    `- 단어 뜻 (meaning): ${submission.meaning || "(제공되지 않음)"}`,
    `- 참고 예문 (example): ${submission.example || "(제공되지 않음)"}`,
    `- 한국어 제시문 (prompt): ${submission.prompt}`,
    `- 학습자가 제출한 영어 답안 (answer): ${submission.answer}`,
    ``,
    `위 답안을 평가하여 JSON 스키마 형식으로 응답해 주세요.`
  ].join("\n");

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }]
      }
    ],
    systemInstruction: {
      parts: [{ text: instructions }]
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          verdict: {
            type: "STRING",
            enum: ["good", "polish", "retry"]
          },
          feedback: {
            type: "STRING"
          },
          correctedSentence: {
            type: "STRING"
          },
          tips: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          targetUsed: {
            type: "BOOLEAN"
          }
        },
        required: [
          "verdict",
          "feedback",
          "correctedSentence",
          "tips",
          "targetUsed"
        ]
      }
    }
  };

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(25_000)
  });
}

export async function GET(request: Request) {
  const apiKey = resolveApiKey(request);
  const hasServerKey = Boolean(
    cfEnv?.GEMINI_API_KEY?.trim() ||
    (typeof process !== "undefined" && process.env?.GEMINI_API_KEY?.trim())
  );

  return reply({
    configured: Boolean(apiKey),
    hasServerKey,
    provider: "google-gemini",
    defaultModel: cfEnv?.GEMINI_MODEL || "gemini-2.5-flash"
  });
}

export async function POST(request: Request) {
  const isChatGPTEnv = Boolean(request.headers.get("oai-authenticated-user-id"));
  if (isChatGPTEnv) {
    const user = await getChatGPTUser();
    if (!user) return reply({ error: "로그인이 필요합니다." }, 401);
  }

  const apiKey = resolveApiKey(request);
  if (!apiKey) {
    return reply(
      {
        code: "missing_api_key",
        error: "Gemini API 키가 설정되지 않았습니다. 상단 설정에서 Gemini API 키를 입력하거나 GEMINI_API_KEY 환경변수를 설정해 주세요."
      },
      400
    );
  }

  let submission: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4_000) return reply({ error: "답안이 너무 깁니다." }, 413);
    submission = JSON.parse(raw);
  } catch {
    return reply({ error: "답안을 읽을 수 없습니다." }, 400);
  }

  if (!validSubmission(submission)) {
    return reply({ error: "답안을 확인해 주세요." }, 400);
  }

  const primaryModel =
    cfEnv?.GEMINI_MODEL ||
    (typeof process !== "undefined" && process.env?.GEMINI_MODEL) ||
    "gemini-2.5-flash";
  const fallbackModel = "gemini-1.5-flash";

  try {
    let response = await requestGemini(primaryModel, apiKey, submission);

    // If primary model returns 404 (model not found), retry with fallback model
    if (response.status === 404 && primaryModel !== fallbackModel) {
      response = await requestGemini(fallbackModel, apiKey, submission);
    }

    if (!response.ok) {
      const status = response.status;
      const errorJson = (await response.json().catch(() => null)) as {
        error?: { message?: string; status?: string; code?: number };
      } | null;

      if (status === 400 || status === 403) {
        return reply(
          {
            code: "invalid_api_key",
            error:
              errorJson?.error?.message ||
              "Gemini API 키가 유효하지 않거나 권한이 없습니다. API 키를 확인해 주세요."
          },
          status
        );
      }

      if (status === 429) {
        return reply(
          {
            code: "quota_exceeded",
            error: "Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
          },
          429
        );
      }

      return reply(
        {
          code: "gemini_error",
          error: errorJson?.error?.message || "Gemini API 호출에 실패했습니다."
        },
        502
      );
    }

    const result = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const textPart = result.candidates?.[0]?.content?.parts?.find(
      (p) => typeof p.text === "string"
    )?.text;

    if (!textPart) {
      return reply({ error: "Gemini 평가 응답을 읽을 수 없습니다." }, 502);
    }

    const cleanedText = cleanJsonString(textPart);
    const assessment = parseAssessment(JSON.parse(cleanedText));

    if (!assessment) {
      return reply({ error: "평가 결과를 분석할 수 없습니다." }, 502);
    }

    return reply({
      feedback: {
        source: "gemini",
        tone:
          assessment.verdict === "retry"
            ? "review"
            : assessment.verdict === "polish"
            ? "polish"
            : "good",
        title: assessment.feedback,
        notes: assessment.tips,
        suggestion: assessment.correctedSentence,
        suggestionLabel: "Gemini가 다듬은 문장",
        changed:
          assessment.correctedSentence.trim().toLowerCase() !==
          submission.answer.trim().toLowerCase(),
        usedTerm: assessment.targetUsed
      }
    });
  } catch (error) {
    const err = error as Error;
    if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
      return reply(
        {
          code: "timeout",
          error: "Gemini API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
        },
        504
      );
    }
    return reply(
      {
        code: "gemini_failed",
        error: "Gemini API 평가 중 오류가 발생했습니다: " + (err.message || "")
      },
      502
    );
  }
}
