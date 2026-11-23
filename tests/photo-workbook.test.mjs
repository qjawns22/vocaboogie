import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

test("photo import sends image to Gemini and preserves five examples", async () => {
  const { POST } = await import("../app/api/import-photo/route.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    const request = JSON.parse(options.body);
    assert.equal(request.contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.equal(request.contents[0].parts[1].inlineData.data, "AQID");
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ entries: [{
      term: "be on the same page", meaning: "서로 생각이 같다", originalTerm: "be on the some page",
      correction: true, meaningFilled: false,
      examples: ["We are on the same page.", "Let's get on the same page.", "Are we on the same page?", "The team is on the same page.", "I want us on the same page."]
    }] }) }] } }] });
  };
  try {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([1, 2, 3])], "note.png", { type: "image/png" }));
    const response = await POST(new Request("http://localhost/api/import-photo", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.entries[0].term, "be on the same page");
    assert.equal(result.entries[0].examples.length, 5);
    assert.equal(result.entries[0].correction, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("photo import explains exhausted Gemini quota", async () => {
  const { POST } = await import("../app/api/import-photo/route.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 402 });
  try {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([1, 2, 3])], "note.png", { type: "image/png" }));
    const response = await POST(new Request("http://localhost/api/import-photo", { method: "POST", body: form }));
    assert.equal(response.status, 402);
    assert.match((await response.json()).error, /사용 한도/);
  } finally { globalThis.fetch = originalFetch; }
});

test("workbook export creates seven styled columns and a fresh XLSX", async () => {
  const { POST } = await import("../app/api/export-workbook/route.ts");
  const response = await POST(new Request("http://localhost/api/export-workbook", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words: [{ term: "discover", meaning: "발견하다", examples: ["I discovered a café.", "She discovered a clue.", "We discovered a shortcut.", "They discovered the issue.", "He discovered a new song."] }] })
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition"), /Vocabulary_Workbook_\d{8}\.xlsx/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = workbook.getWorksheet("Vocabulary");
  assert.ok(sheet);
  assert.equal(sheet.columnCount, 7);
  assert.deepEqual(sheet.getRow(1).values.slice(1), ["영어", "뜻", "예문 1", "예문 2", "예문 3", "예문 4", "예문 5"]);
  assert.equal(sheet.getCell("A2").value, "discover");
  assert.equal(sheet.getCell("G2").value, "He discovered a new song.");
  assert.equal(sheet.getCell("A1").fill.fgColor.argb, "FF2C3E50");
  assert.equal(sheet.getCell("A2").font.bold, true);
  assert.equal(sheet.getCell("C2").alignment.wrapText, true);
  assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(sheet.autoFilter, "A1:G1");
});
