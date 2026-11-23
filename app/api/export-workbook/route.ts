import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

type Word = { term: string; meaning: string; examples: string[] };

function validWords(value: unknown): value is Word[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 1000 && value.every((word) =>
    word && typeof word === "object" &&
    typeof word.term === "string" && word.term.length > 0 && word.term.length <= 200 &&
    typeof word.meaning === "string" && word.meaning.length <= 500 &&
    Array.isArray(word.examples) && word.examples.length === 5 &&
    word.examples.every((example: unknown) => typeof example === "string" && example.length <= 1000)
  );
}

export async function POST(request: Request) {
  if (request.headers.get("oai-authenticated-user-id")) {
    try {
      const { getChatGPTUser } = await import("../../chatgpt-auth");
      if (!await getChatGPTUser()) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    } catch { return Response.json({ error: "인증을 확인할 수 없습니다." }, { status: 401 }); }
  }
  let words: unknown;
  try {
    const body = await request.text();
    if (body.length > 2_000_000) return Response.json({ error: "단어장이 너무 큽니다." }, { status: 413 });
    words = (JSON.parse(body) as { words?: unknown }).words;
  } catch { return Response.json({ error: "단어장을 읽을 수 없습니다." }, { status: 400 }); }
  if (!validWords(words)) return Response.json({ error: "내보낼 단어가 없습니다." }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Vocabulary", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "영어", key: "term", width: 30 },
    { header: "뜻", key: "meaning", width: 34 },
    ...Array.from({ length: 5 }, (_, index) => ({ header: `예문 ${index + 1}`, key: `example${index + 1}`, width: 52 }))
  ];
  sheet.autoFilter = { from: "A1", to: "G1" };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C3E50" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  words.forEach((word, index) => {
    const row = sheet.addRow([word.term, word.meaning, ...word.examples]);
    row.height = 64;
    row.eachCell((cell, column) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFFFFFFF" : "FFF4F7FA" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD5DDE4" } },
        left: { style: "thin", color: { argb: "FFD5DDE4" } },
        bottom: { style: "thin", color: { argb: "FFD5DDE4" } },
        right: { style: "thin", color: { argb: "FFD5DDE4" } }
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (column === 1) cell.font = { bold: true };
    });
  });

  const bytes = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Vocabulary_Workbook_${date}.xlsx"`,
      "Cache-Control": "no-store"
    }
  });
}
