import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function reply(body: unknown, status = 200) { return Response.json(body, { status, headers }); }
function validState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.words) && Array.isArray(data.wrongNotes) && typeof data.day === "string" && typeof data.dayAnswers === "number";
}
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "로그인이 필요합니다." }, 401);
  if (!env.DB) return reply({ error: "저장소에 연결할 수 없습니다." }, 503);
  const row = await env.DB.prepare("SELECT payload, version FROM vocab_states WHERE user_id = ?").bind(user.userId).first<{ payload: string; version: number }>();
  return reply({ state: row ? JSON.parse(row.payload) : null, version: row?.version ?? 0, userId: user.userId });
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "로그인이 필요합니다." }, 401);
  let body: { state?: unknown; expectedVersion?: unknown };
  try { body = await request.json(); } catch { return reply({ error: "잘못된 요청입니다." }, 400); }
  if (!validState(body.state) || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) return reply({ error: "잘못된 단어장입니다." }, 400);
  const payload = JSON.stringify(body.state);
  if (payload.length > 2_000_000) return reply({ error: "단어장이 너무 큽니다." }, 413);
  const version = Number(body.expectedVersion);
  if (!env.DB) return reply({ error: "저장소에 연결할 수 없습니다." }, 503);
  const result = version === 0
    ? await env.DB.prepare("INSERT OR IGNORE INTO vocab_states (user_id, payload, version, updated_at) VALUES (?, ?, 1, ?)").bind(user.userId, payload, Date.now()).run()
    : await env.DB.prepare("UPDATE vocab_states SET payload = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?").bind(payload, Date.now(), user.userId, version).run();
  if (!result.meta.changes) return reply({ error: "다른 기기에서 단어장이 변경됐습니다." }, 409);
  return reply({ state: body.state, version: version + 1 });
}
