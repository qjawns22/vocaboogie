import { resolveApiKey } from "../compose-feedback/route.ts";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}

type GeminiEntry = {
  term?: unknown;
  meaning?: unknown;
  examples?: unknown;
  originalTerm?: unknown;
  correction?: unknown;
  meaningFilled?: unknown;
};

function parseEntries(value: unknown) {
  if (!value || typeof value !== "object" || !Array.isArray((value as { entries?: unknown }).entries)) return null;
  const entries = (value as { entries: GeminiEntry[] }).entries;
  if (entries.length > 300) return null;
  const result = entries.map((entry) => {
    const term = typeof entry.term === "string" ? entry.term.trim() : "";
    const meaning = typeof entry.meaning === "string" ? entry.meaning.trim() : "";
    const examples = Array.isArray(entry.examples)
      ? entry.examples.map((s) => typeof s === "string" ? s.trim() : "")
      : [];
    return {
      term,
      meaning,
      examples,
      originalTerm: typeof entry.originalTerm === "string" ? entry.originalTerm.trim() : "",
      correction: Boolean(entry.correction),
      meaningFilled: Boolean(entry.meaningFilled)
    };
  });
  if (result.some((entry) => !entry.term || !entry.meaning || !/^[A-Za-z]/.test(entry.term) || entry.examples.length !== 5 || entry.examples.some((s) => !s))) return null;
  return result;
}

export async function POST(request: Request) {
  if (request.headers.get("oai-authenticated-user-id")) {
    try {
      const { getChatGPTUser } = await import("../../chatgpt-auth");
      if (!await getChatGPTUser()) return reply({ error: "로그인이 필요합니다." }, 401);
    } catch {
      return reply({ error: "인증을 확인할 수 없습니다." }, 401);
    }
  }

  const apiKey = resolveApiKey(request);
  if (!apiKey) return reply({ error: "Gemini API 키가 설정되지 않았습니다." }, 400);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return reply({ error: "사진을 읽을 수 없습니다." }, 400); }
  const file = form.get("photo");
  const typedText = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
  if (file) {
    if (!(file instanceof File) || !imageTypes.has(file.type) || !file.size || file.size > MAX_IMAGE_BYTES) {
      return reply({ error: "JPG, PNG, WEBP 사진(10MB 이하)을 올려주세요." }, 400);
    }
  } else if (!typedText || typedText.length > 20000) {
    return reply({ error: "분석할 텍스트를 20,000자 이하로 입력해 주세요." }, 400);
  }

  const image = file instanceof File ? base64(new Uint8Array(await file.arrayBuffer())) : null;
  const prompt = [
    file ? "이 영어 학습 노트 사진에서 영어 단어, 숙어, 회화 표현을 보이는 순서대로 빠짐없이 추출하세요." : "다음 영어 학습 목록에서 영어 단어, 숙어, 회화 표현을 적힌 순서대로 빠짐없이 추출하세요.",
    "각 항목의 한글 뜻은 원문 표현과 뉘앙스를 최대한 그대로 보존하세요. 뜻이 비어 있을 때만 가장 자연스러운 대표 뜻을 채우고 meaningFilled=true로 표시하세요.",
    "영어 철자나 문법적 오타는 자연스러운 표준 표현으로 수정하세요. 수정 전 표현은 originalTerm에, 수정 여부는 correction에 담으세요.",
    "각 표현마다 일상, 학교, 직장 등 서로 다른 상황에서 원어민이 실제 쓸 법한 자연스러운 영어 예문 5개를 직접 작성하세요.",
    "입력에 없는 표현을 만들어내지 마세요. 판독이 불가능한 항목은 추측하지 말고 제외하세요.",
    "JSON의 entries 배열만 응답하세요. 각 항목은 term, meaning, originalTerm, correction, meaningFilled, examples(정확히 5문장)를 포함합니다."
  ].join("\n") + (typedText ? `\n\n입력 목록:\n${typedText}` : "");
  const models = Array.from(new Set([
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-3-flash-preview"
  ].filter(Boolean) as string[]));

  try {
    let response: Response | null = null;
    for (const model of models) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: image && file instanceof File ? [{ text: prompt }, { inlineData: { mimeType: file.type, data: image } }] : [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 32768 }
        }),
        signal: AbortSignal.timeout(120000)
      });
      if (response.status !== 404 && response.status !== 503) break;
    }
    if (!response?.ok) {
      if (response?.status === 402 || response?.status === 429) return reply({ error: "Gemini API 사용 한도가 부족합니다. API 할당량과 결제 상태를 확인해 주세요." }, response.status);
      return reply({ error: "Gemini 사진 분석에 실패했습니다. 잠시 후 다시 시도해 주세요." }, response?.status === 400 ? 400 : 502);
    }
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = data.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    if (!raw) return reply({ error: "사진 분석 결과를 읽을 수 없습니다." }, 502);
    const entries = parseEntries(JSON.parse(raw));
    if (!entries) return reply({ error: "사진 분석 결과의 형식이 올바르지 않습니다. 다시 시도해 주세요." }, 502);
    return reply({ entries });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return reply({ error: "사진 분석 시간이 초과되었습니다. 다시 시도해 주세요." }, 504);
    return reply({ error: "Gemini 사진 분석 중 오류가 발생했습니다." }, 502);
  }
}
