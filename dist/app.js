(function () {
  "use strict";

  var STORE_KEY = "wordkit-v1";
  var SAMPLE_WORDS = [
    { term: "curiosity", meaning: "호기심", example: "Curiosity leads to discovery." },
    { term: "discover", meaning: "발견하다", example: "We discover something new every day." },
    { term: "vivid", meaning: "생생한", example: "She has a vivid imagination." },
    { term: "gentle", meaning: "부드러운", example: "A gentle breeze was blowing." },
    { term: "journey", meaning: "여정", example: "Learning is a journey." },
    { term: "brave", meaning: "용감한", example: "Be brave enough to try." }
  ];
  var CURATED = Array.isArray(window.WORDKIT_CURATED) ? window.WORDKIT_CURATED : [];
  var CURATED_BY_TERM = new Map();
  CURATED.forEach(function (entry) {
    CURATED_BY_TERM.set(normalizeTerm(entry.originalTerm), entry);
    if (!CURATED_BY_TERM.has(normalizeTerm(entry.term))) CURATED_BY_TERM.set(normalizeTerm(entry.term), entry);
  });
  SAMPLE_WORDS.forEach(function (entry) {
    var key = normalizeTerm(entry.term);
    if (!CURATED_BY_TERM.has(key)) {
      CURATED_BY_TERM.set(key, {
        originalTerm: entry.term,
        sourceMeaning: entry.meaning,
        term: entry.term,
        meaning: entry.meaning,
        example: entry.example
      });
    }
  });
  var state = loadState();
  var draftRows = [];
  var currentFilter = "all";
  var currentPage = "home";
  var study = null;
  var toastTimer = null;
  var photoUrl = null;

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function todayKey(date) {
    var d = date || new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }
  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return todayKey(d);
  }
  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return {
        words: Array.isArray(saved.words) ? saved.words : [],
        xp: Number(saved.xp) || 0,
        streak: Number(saved.streak) || 0,
        lastStudy: saved.lastStudy || "",
        day: saved.day || "",
        dayAnswers: Number(saved.dayAnswers) || 0,
        curatedSeeded: saved.curatedSeeded === true
      };
    } catch (e) {
      return { words: [], xp: 0, streak: 0, lastStudy: "", day: "", dayAnswers: 0, curatedSeeded: false };
    }
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("이 브라우저에 저장할 수 없어요. 저장 공간을 확인해 주세요."); }
    renderDashboard();
  }
  function toast(message) {
    var el = byId("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3600);
  }
  function normalizeTerm(text) {
    return String(text || "").trim().toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
  }
  function curateDraftRow(row) {
    var entry = CURATED_BY_TERM.get(normalizeTerm(row.term));
    if (!entry) return row;
    return {
      term: entry.term,
      meaning: !row.meaning || row.meaning === entry.sourceMeaning ? entry.meaning : row.meaning,
      example: row.example || entry.example
    };
  }
  function enrichSavedWords() {
    if (!CURATED.length) return false;
    var changed = false;
    if (!state.curatedSeeded && !state.words.length) {
      var seen = new Set();
      var now = Date.now();
      CURATED.forEach(function (entry, index) {
        var key = normalizeTerm(entry.term);
        if (seen.has(key)) return;
        seen.add(key);
        state.words.push({
          id: "curated-" + index,
          term: entry.term,
          meaning: entry.meaning,
          example: entry.example,
          level: 0,
          dueAt: 0,
          addedAt: now - index
        });
      });
      state.curatedSeeded = true;
      return true;
    }
    state.words.forEach(function (word) {
      var entry = CURATED_BY_TERM.get(normalizeTerm(word.term));
      if (!entry) return;
      if (!word.example || /^\d+(?:\.\d+)?$/.test(String(word.example).trim())) {
        word.example = entry.example;
        changed = true;
      }
      if (normalizeTerm(word.term) === normalizeTerm(entry.originalTerm) && word.term !== entry.term) {
        word.term = entry.term;
        changed = true;
      }
      if ((!word.meaning || word.meaning === entry.sourceMeaning) && word.meaning !== entry.meaning) {
        word.meaning = entry.meaning;
        changed = true;
      }
    });
    var uniqueWords = new Map();
    state.words = state.words.filter(function (word) {
      var key = normalizeTerm(word.term);
      var first = uniqueWords.get(key);
      if (!first) { uniqueWords.set(key, word); return true; }
      if (!first.meaning && word.meaning) first.meaning = word.meaning;
      if (!first.example && word.example) first.example = word.example;
      first.level = Math.max(Number(first.level) || 0, Number(word.level) || 0);
      changed = true;
      return false;
    });
    if (!state.curatedSeeded) { state.curatedSeeded = true; changed = true; }
    return changed;
  }
  function formatDate() {
    var formatter = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" });
    byId("todayDate").textContent = formatter.format(new Date());
  }
  function go(page) {
    if (!byId("page-" + page)) return;
    currentPage = page;
    document.querySelectorAll(".page").forEach(function (el) { el.classList.toggle("active", el.id === "page-" + page); });
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === page);
    });
    byId("pageLabel").textContent = { home: "홈", import: "가져오기", words: "내 단어장", study: "학습하기" }[page];
    if (page === "words") renderWords();
    if (page === "study") renderStudy();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "#" + page);
  }
  function effectiveStreak() {
    return state.lastStudy === todayKey() || state.lastStudy === yesterdayKey() ? state.streak : 0;
  }
  function renderDashboard() {
    var daily = state.day === todayKey() ? state.dayAnswers : 0;
    byId("todayLearned").textContent = Math.min(daily, 10);
    byId("todayProgressBar").style.width = Math.min(100, daily * 10) + "%";
    byId("todaySubtext").textContent = daily >= 10 ? "오늘의 목표를 달성했어요! ✦" : daily ? (10 - Math.min(daily, 10)) + "단어만 더 보면 목표 달성" : "첫 단어를 기다리고 있어요";
    byId("totalWords").textContent = state.words.length;
    byId("sideWordCount").textContent = state.words.length;
    byId("streakDays").textContent = effectiveStreak();
    byId("totalXp").textContent = state.xp;
    var recent = state.words.slice().sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); }).slice(0, 4);
    byId("recentWords").innerHTML = recent.length ? recent.map(function (w) {
      return '<div class="recent-item"><strong>' + escapeHtml(w.term) + '</strong><span>' + escapeHtml(w.meaning || "뜻을 추가해 주세요") + '</span></div>';
    }).join("") : '<p class="empty-mini">아직 단어가 없어요.<br>사진이나 엑셀을 올려 첫 단어장을 만들어 보세요.</p>';
  }
  function openPicker(kind) {
    go("import");
    byId(kind === "photo" ? "photoInput" : "excelInput").click();
  }
  function fileKind(file) {
    var name = file.name.toLowerCase();
    if (file.type.indexOf("image/") === 0 || /\.(png|jpg|jpeg|webp|heic|heif)$/.test(name)) return "photo";
    if (/\.(xlsx|xls|csv|tsv)$/.test(name)) return "excel";
    return "";
  }
  async function acceptFile(file) {
    if (!file) return;
    var kind = fileKind(file);
    if (!kind) { toast("사진 또는 엑셀 파일을 선택해 주세요."); return; }
    go("import");
    if (kind === "photo") await readPhoto(file);
    else await readSpreadsheet(file);
  }
  function showReview(summary, isPhoto) {
    byId("reviewPanel").hidden = false;
    byId("reviewSummary").textContent = summary;
    byId("ocrLayout").hidden = !isPhoto;
    byId("reviewPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function clearDraft() {
    draftRows = [];
    byId("reviewPanel").hidden = true;
    byId("ocrProgress").hidden = true;
    byId("ocrText").value = "";
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    byId("photoInput").value = "";
    byId("excelInput").value = "";
    byId("anyInput").value = "";
  }
  function parseText(text) {
    var lines = String(text || "").split(/\r?\n/);
    var result = [];
    lines.forEach(function (original) {
      var line = original.trim().replace(/^[\s•·*\-–—]*(?:\d{1,3}[\s.)\-]+)?/, "").trim();
      if (!line || !/[A-Za-z]/.test(line)) return;
      var pieces = line.split(/\s*[,;]\s*/).filter(Boolean);
      if (pieces.length > 1 && pieces.every(function (p) { return /^[A-Za-z][A-Za-z' -]{0,55}$/.test(p.trim()); })) {
        pieces.forEach(function (p) { result.push({ term: p.trim(), meaning: "", example: "" }); });
        return;
      }
      var match = line.match(/^([A-Za-z][A-Za-z' -]{0,65}?)\s*(?:[:=–—]\s*|\s{2,})(.+)$/);
      if (!match) match = line.match(/^([A-Za-z][A-Za-z' -]{0,65}?)\s+([가-힣].+)$/);
      var term = match ? match[1].trim() : line;
      var meaning = match ? match[2].trim() : "";
      term = term.replace(/^[^A-Za-z]+|[^A-Za-z' -]+$/g, "").trim();
      if (!term || term.length > 70 || term.split(/\s+/).length > 7) return;
      result.push({ term: term, meaning: meaning, example: "" });
    });
    return result.slice(0, 300);
  }
  async function makeOcrImage(file) {
    var url = URL.createObjectURL(file);
    try {
      var image = await new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = url;
      });
      var scale = Math.min(2, Math.max(1, 1700 / Math.max(image.width, image.height)));
      if (Math.max(image.width, image.height) * scale > 2600) scale = 2600 / Math.max(image.width, image.height);
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      var context = canvas.getContext("2d", { willReadFrequently: true });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < pixels.data.length; i += 4) {
        var gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2];
        var value = Math.max(0, Math.min(255, (gray - 128) * 1.34 + 138));
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      return canvas;
    } finally { URL.revokeObjectURL(url); }
  }
  async function readPhoto(file) {
    clearDraft();
    if (file.size > 20 * 1024 * 1024) { toast("사진은 20MB 이하로 올려주세요."); return; }
    photoUrl = URL.createObjectURL(file);
    byId("ocrImage").src = photoUrl;
    byId("ocrText").value = "";
    showReview(file.name + " · 읽어낸 글씨를 확인하고 단어를 수정해 주세요.", true);
    byId("ocrProgress").hidden = false;
    byId("ocrProgressText").textContent = "손글씨를 읽을 준비 중… 처음에는 모델을 불러오는 데 잠시 걸려요.";
    renderDraft();
    if (!window.Tesseract) {
      byId("ocrProgress").hidden = true;
      toast("사진 인식 도구를 불러오지 못했어요. 오른쪽에 단어를 직접 적을 수 있어요.");
      return;
    }
    var worker = null;
    try {
      var image = await makeOcrImage(file);
      worker = await Tesseract.createWorker("eng", 1, {
        workerPath: new URL("./tesseract-worker.min.js", location.href).href,
        corePath: new URL("./ocr/core", location.href).href,
        langPath: new URL("./ocr/lang", location.href).href,
        logger: function (m) {
          var percent = Math.round((m.progress || 0) * 100);
          byId("ocrProgressText").textContent = (m.status === "recognizing text" ? "글씨를 읽는 중" : "인식 도구 준비 중") + "… " + percent + "%";
        }
      });
      var result = await worker.recognize(image);
      var raw = result.data.text.trim();
      byId("ocrText").value = raw;
      draftRows = parseText(raw).map(curateDraftRow);
      renderDraft();
      byId("reviewSummary").textContent = draftRows.length + "개 후보를 찾았어요. 손글씨는 틀릴 수 있으니 반드시 확인해 주세요.";
      if (!raw) toast("읽어낸 글씨가 없어요. 사진을 다시 찍거나 직접 적어 주세요.");
    } catch (error) {
      console.error("OCR failed", error);
      toast("사진 자동 인식에 실패했어요. 읽어낸 글씨 칸에 단어를 직접 적어 주세요.");
      byId("reviewSummary").textContent = "사진을 보면서 오른쪽 칸에 한 줄에 한 단어씩 적을 수 있어요.";
    } finally {
      if (worker) await worker.terminate().catch(function () {});
      byId("ocrProgress").hidden = true;
    }
  }
  function bestColumns(rows) {
    var headerAt = -1, wordCol = -1, meaningCol = -1, exampleCol = -1;
    for (var i = 0; i < Math.min(rows.length, 5); i++) {
      var row = rows[i].map(function (cell) { return String(cell || "").trim().toLowerCase(); });
      var w = row.findIndex(function (x) { return /^(영어|영단어|단어|word|english|eng|vocabulary|term|표현)$/.test(x); });
      if (w !== -1) {
        headerAt = i; wordCol = w;
        meaningCol = row.findIndex(function (x) { return /^(뜻|의미|해석|한국어|korean|kor|meaning|definition|translation)$/.test(x); });
        exampleCol = row.findIndex(function (x) { return /^(예문|문장|example|sentence)$/.test(x); });
        break;
      }
    }
    if (wordCol === -1) {
      var sample = rows.slice(0, 8);
      var maxCols = Math.min(8, Math.max.apply(null, sample.map(function (r) { return r.length; }).concat([0])));
      var scores = [];
      for (var c = 0; c < maxCols; c++) {
        scores[c] = sample.filter(function (r) { return /^[A-Za-z][A-Za-z' -]{0,65}$/.test(String(r[c] || "").trim()); }).length;
      }
      wordCol = scores.indexOf(Math.max.apply(null, scores));
      meaningCol = wordCol + 1;
      exampleCol = -1;
    }
    return { headerAt: headerAt, wordCol: wordCol, meaningCol: meaningCol, exampleCol: exampleCol };
  }
  async function readSpreadsheet(file) {
    clearDraft();
    if (file.size > 12 * 1024 * 1024) { toast("엑셀 파일은 12MB 이하로 올려주세요."); return; }
    if (!window.XLSX) { toast("엑셀 읽기 도구를 불러오지 못했어요."); return; }
    try {
      var bytes = await file.arrayBuffer();
      var book = XLSX.read(bytes, { type: "array" });
      var found = [];
      var foundByTerm = new Map();
      book.SheetNames.forEach(function (name) {
        var rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "", blankrows: false });
        if (!rows.length) return;
        var map = bestColumns(rows);
        rows.slice(map.headerAt + 1).forEach(function (row) {
          var term = String(row[map.wordCol] || "").trim();
          var meaning = map.meaningCol >= 0 ? String(row[map.meaningCol] || "").trim() : "";
          var example = map.exampleCol >= 0 ? String(row[map.exampleCol] || "").trim() : "";
          if (!/^[A-Za-z]/.test(term) || term.length > 100) return;
          if (/^(eng|english|word|vocabulary|term)$/i.test(term) && /^(kor|korean|meaning|definition|translation|뜻|의미|해석)$/i.test(meaning)) return;
          var key = normalizeTerm(term);
          var existing = foundByTerm.get(key);
          if (existing) {
            if (meaning && !existing.meaning.split(" · ").includes(meaning)) existing.meaning += (existing.meaning ? " · " : "") + meaning;
            if (example && !existing.example) existing.example = example;
          } else {
          var entry = curateDraftRow({ term: term, meaning: meaning, example: example });
            foundByTerm.set(key, entry);
            found.push(entry);
          }
        });
      });
      draftRows = found.slice(0, 1000);
      showReview(file.name + " · " + book.SheetNames.length + "개 시트에서 " + draftRows.length + "개 단어를 찾았어요.", false);
      renderDraft();
      if (found.length > 1000) toast("한 번에 최대 1,000개까지 확인할 수 있어요.");
      if (!draftRows.length) toast("영단어를 찾지 못했어요. 단어가 들어 있는 열을 확인해 주세요.");
    } catch (error) {
      console.error("Spreadsheet read failed", error);
      toast("엑셀 파일을 읽지 못했어요. XLSX, XLS 또는 CSV 파일인지 확인해 주세요.");
    }
  }
  function renderDraft() {
    byId("draftBody").innerHTML = draftRows.map(function (row, index) {
      return '<tr data-index="' + index + '"><td><input data-field="term" aria-label="' + (index + 1) + '번째 영단어" value="' + escapeHtml(row.term) + '" placeholder="영단어"></td><td><input data-field="meaning" aria-label="' + (index + 1) + '번째 뜻" value="' + escapeHtml(row.meaning) + '" placeholder="뜻"></td><td><input data-field="example" aria-label="' + (index + 1) + '번째 예문" value="' + escapeHtml(row.example) + '" placeholder="예문"></td><td><button class="row-remove" data-remove="' + index + '" aria-label="' + (index + 1) + '번째 단어 삭제">×</button></td></tr>';
    }).join("");
  }
  function collectDraftInputs() {
    draftRows = Array.from(byId("draftBody").querySelectorAll("tr")).map(function (tr) {
      return {
        term: tr.querySelector('[data-field="term"]').value.trim(),
        meaning: tr.querySelector('[data-field="meaning"]').value.trim(),
        example: tr.querySelector('[data-field="example"]').value.trim()
      };
    });
  }
  function saveDraft() {
    collectDraftInputs();
    var added = 0, updated = 0, seen = {};
    draftRows.forEach(function (row) {
      var key = normalizeTerm(row.term);
      if (!key || !/[a-z]/.test(key) || seen[key]) return;
      seen[key] = true;
      var existing = state.words.find(function (w) { return normalizeTerm(w.term) === key; });
      if (existing) {
        if (row.meaning && !existing.meaning) { existing.meaning = row.meaning; updated++; }
        if (row.example && !existing.example) { existing.example = row.example; updated++; }
      } else {
        state.words.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(), term: row.term, meaning: row.meaning, example: row.example, level: 0, dueAt: 0, addedAt: Date.now() + added });
        added++;
      }
    });
    if (!added && !updated) { toast("추가할 영단어가 없어요. 단어 칸을 확인해 주세요."); return; }
    persist();
    clearDraft();
    renderWords();
    toast(added + "개 단어를 추가했어요" + (updated ? " · " + updated + "개 항목을 보완했어요" : "") + "!");
    go("words");
  }
  function renderWords() {
    var search = normalizeTerm(byId("wordSearch").value);
    var now = Date.now();
    var list = state.words.slice().sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); }).filter(function (w) {
      if (search && !(normalizeTerm(w.term + " " + w.meaning + " " + w.example).includes(search))) return false;
      if (currentFilter === "due" && Number(w.dueAt || 0) > now) return false;
      if (currentFilter === "mastered" && Number(w.level || 0) < 3) return false;
      return true;
    });
    var holder = byId("wordList");
    if (!list.length) {
      holder.innerHTML = '<div class="empty-state"><div class="empty-illustration">✦</div><h3>' + (state.words.length ? "조건에 맞는 단어가 없어요" : "첫 단어장을 만들어 볼까요?") + '</h3><p>' + (state.words.length ? "검색어나 필터를 바꿔 보세요." : "사진이나 엑셀을 올려 나만의 단어를 모아 보세요.") + '</p>' + (state.words.length ? "" : '<button class="btn btn-dark" data-nav="import">단어 가져오기 →</button>') + '</div>';
      return;
    }
    holder.innerHTML = list.map(function (w) {
      var level = Number(w.level) || 0;
      var marker = level >= 3 ? "mastered" : w.dueAt && w.dueAt <= now ? "ready" : "";
      return '<article class="word-row" data-id="' + escapeHtml(w.id) + '"><div class="word-main"><strong>' + escapeHtml(w.term) + '</strong><small>' + (level >= 3 ? "익숙한 단어" : level ? "복습 중" : "새 단어") + '</small></div><div class="word-meaning">' + escapeHtml(w.meaning || "뜻을 추가해 주세요") + '</div><div class="word-example"><span>회화 예문</span>' + escapeHtml(w.example || "예문을 추가해 보세요") + '</div><div class="word-actions"><span class="mastery-dot ' + marker + '" aria-hidden="true"></span><button data-edit="' + escapeHtml(w.id) + '" aria-label="' + escapeHtml(w.term) + ' 수정">✎</button><button data-delete="' + escapeHtml(w.id) + '" aria-label="' + escapeHtml(w.term) + ' 삭제">×</button></div></article>';
    }).join("");
  }
  function editWord(id) {
    var word = state.words.find(function (w) { return w.id === id; });
    var row = Array.from(document.querySelectorAll(".word-row")).find(function (el) { return el.getAttribute("data-id") === id; });
    if (!word || !row) return;
    if (row.querySelector(".word-edit")) { row.querySelector(".word-edit").remove(); return; }
    row.insertAdjacentHTML("beforeend", '<div class="word-edit"><label>영단어<input data-edit-field="term" value="' + escapeHtml(word.term) + '"></label><label>뜻<input data-edit-field="meaning" value="' + escapeHtml(word.meaning) + '"></label><label>예문<input data-edit-field="example" value="' + escapeHtml(word.example) + '"></label><button class="btn btn-dark" data-save-word="' + escapeHtml(id) + '">저장</button></div>');
  }
  function saveWord(id) {
    var word = state.words.find(function (w) { return w.id === id; });
    var row = Array.from(document.querySelectorAll(".word-row")).find(function (el) { return el.getAttribute("data-id") === id; });
    if (!word || !row) return;
    var edit = row.querySelector(".word-edit");
    var term = edit.querySelector('[data-edit-field="term"]').value.trim();
    if (!term || !/[A-Za-z]/.test(term)) { toast("영단어를 입력해 주세요."); return; }
    var duplicate = state.words.some(function (w) { return w.id !== id && normalizeTerm(w.term) === normalizeTerm(term); });
    if (duplicate) { toast("이미 같은 단어가 있어요."); return; }
    word.term = term;
    word.meaning = edit.querySelector('[data-edit-field="meaning"]').value.trim();
    word.example = edit.querySelector('[data-edit-field="example"]').value.trim();
    persist(); renderWords(); toast("단어를 수정했어요.");
  }
  function exportCsv() {
    if (!state.words.length) { toast("내보낼 단어가 없어요."); return; }
    var quote = function (v) { return '"' + String(v || "").replace(/"/g, '""') + '"'; };
    var content = "\uFEFF" + [["단어", "뜻", "예문"], ...state.words.map(function (w) { return [w.term, w.meaning, w.example]; })].map(function (r) { return r.map(quote).join(","); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = url; link.download = "wordkit-words-" + todayKey() + ".csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("단어장을 CSV로 내보냈어요.");
  }
  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
    }
    return arr;
  }
  function startStudy() {
    if (!state.words.length) { go("import"); toast("먼저 단어를 추가해 주세요."); return; }
    var now = Date.now();
    var due = shuffle(state.words.filter(function (w) { return Number(w.dueAt || 0) <= now; }));
    var later = shuffle(state.words.filter(function (w) { return Number(w.dueAt || 0) > now; }));
    var pool = due.concat(later).slice(0, 10);
    study = { pool: pool, index: 0, correct: 0, xp: 0, feedback: null, hidden: false, choiceOptions: null };
    go("study"); renderStudy();
  }
  function currentQuestionMode(word) {
    var withMeaning = state.words.filter(function (w) { return w.meaning; });
    if (word.meaning && withMeaning.length >= 4 && study.index % 2 === 0) return "choice";
    if (word.meaning) return "type";
    return "memory";
  }
  function renderStudy() {
    var shell = byId("studyShell");
    if (!state.words.length) {
      shell.innerHTML = '<div class="study-welcome"><div class="study-graphic">▧</div><h2>단어를 먼저 모아 주세요</h2><p>사진 또는 엑셀을 올리면 바로 학습을 시작할 수 있어요.</p><button class="btn btn-dark" data-nav="import">단어 가져오기 →</button></div>';
      return;
    }
    if (!study) {
      var due = state.words.filter(function (w) { return Number(w.dueAt || 0) <= Date.now(); }).length;
      shell.innerHTML = '<div class="study-welcome"><div class="study-graphic">✦</div><span class="kicker">READY FOR A QUICK ROUND?</span><h2>오늘의 단어를 만나볼까요?</h2><p>헷갈리는 단어를 먼저 보고, 뜻이 있다면 객관식과 타이핑으로 연습해요.<br>한 라운드는 최대 10문제예요.</p><button class="btn btn-dark" data-study-start>학습 시작하기 →</button><div class="study-small">지금 복습할 단어 ' + due + '개 · 전체 ' + state.words.length + '개</div></div>';
      return;
    }
    if (study.index >= study.pool.length) {
      shell.innerHTML = '<div class="study-result"><div class="result-stars">✦ ✧ ✦</div><span class="kicker">ROUND COMPLETE</span><h2>오늘도 해냈어요!</h2><p>조금씩 반복한 단어가 오래 남아요.<br>헷갈린 단어는 다음 학습에서 다시 만나요.</p><div class="result-metrics"><span><strong>' + study.correct + '/' + study.pool.length + '</strong>기억한 단어</span><span><strong>+' + study.xp + '</strong>이번 라운드 XP</span></div><button class="btn btn-dark" data-study-again>한 번 더 학습 →</button></div>';
      study = null;
      return;
    }
    var word = study.pool[study.index];
    var mode = currentQuestionMode(word);
    var answered = !!study.feedback;
    var head = '<div class="study-card"><div class="study-head"><span>오늘의 학습</span><span>' + (study.index + 1) + ' / ' + study.pool.length + '</span></div><div class="study-progress"><span style="width:' + Math.round((study.index / study.pool.length) * 100) + '%"></span></div>';
    var body = "";
    if (mode === "choice") {
      if (!study.choiceOptions) {
        var wrong = shuffle(state.words.filter(function (w) { return w.id !== word.id && w.meaning && w.meaning !== word.meaning; })).slice(0, 3).map(function (w) { return w.meaning; });
        study.choiceOptions = shuffle(wrong.concat([word.meaning]));
      }
      body = '<span class="question-tag">뜻 고르기</span><p class="question-prompt">이 단어의 뜻은 무엇일까요?</p><h2 class="question-word">' + escapeHtml(word.term) + '</h2><div class="choice-grid">' + study.choiceOptions.map(function (option, index) {
        var cls = answered ? (option === word.meaning ? " correct" : index === study.feedback.choiceIndex ? " wrong" : "") : "";
        return '<button class="choice' + cls + '" data-choice="' + index + '"' + (answered ? " disabled" : "") + '>' + escapeHtml(option) + '</button>';
      }).join("") + '</div>';
    } else if (mode === "type") {
      body = '<span class="question-tag">단어 쓰기</span><p class="question-prompt">이 뜻에 맞는 영단어를 써 보세요.</p><h2 class="question-word">' + escapeHtml(word.meaning) + '</h2>' + (answered ? "" : '<form class="answer-form" id="answerForm"><input id="answerInput" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="영단어 정답" placeholder="영단어를 입력해 주세요" required><button class="btn btn-dark" type="submit">확인 →</button></form>');
    } else {
      body = '<span class="question-tag">기억 카드</span><p class="question-prompt">단어를 잠깐 보고 기억해 보세요.</p><h2 class="question-word">' + (study.hidden || answered ? '••••••' : escapeHtml(word.term)) + '</h2><p class="memory-prompt">' + (study.hidden || answered ? "방금 본 단어를 직접 써 보세요." : "준비되면 단어를 숨기고 써 보세요. 뜻을 추가하면 다른 퀴즈도 풀 수 있어요.") + '</p>' + (answered ? "" : study.hidden ? '<form class="answer-form" id="answerForm"><input id="answerInput" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="기억한 영단어" placeholder="기억한 단어를 입력해 주세요" required><button class="btn btn-dark" type="submit">확인 →</button></form>' : '<button class="btn btn-outline" data-memory-hide>단어 숨기기 →</button>');
    }
    if (answered) {
      body += '<div class="feedback' + (study.feedback.correct ? "" : " wrong") + '">' + (study.feedback.correct ? "정답이에요! +10 XP ✦" : "괜찮아요, 다음에 다시 만나요.") + '<small>정답: ' + escapeHtml(word.term) + (word.meaning ? " · " + escapeHtml(word.meaning) : "") + '</small>' + (word.example ? '<span class="study-example">' + escapeHtml(word.example) + '</span>' : "") + '</div>';
    }
    body += '<div class="question-bottom"><small>' + (answered ? "헷갈린 단어는 더 자주 나와요." : "천천히 생각해도 괜찮아요.") + '</small>' + (answered ? '<button class="btn btn-dark" data-study-next>다음 단어 →</button>' : "") + '</div></div>';
    shell.innerHTML = head + body;
    if (mode !== "choice" && (study.hidden || mode === "type") && !answered) byId("answerInput").focus();
  }
  function recordAnswer(correct, choiceIndex) {
    if (!study || study.feedback) return;
    var word = study.pool[study.index];
    var intervals = [1, 3, 7, 14, 30, 60];
    if (correct) {
      word.level = Math.min(6, (Number(word.level) || 0) + 1);
      word.dueAt = Date.now() + intervals[Math.min(word.level - 1, intervals.length - 1)] * 86400000;
      study.correct++;
      study.xp += 10;
      state.xp += 10;
    } else {
      word.level = 0;
      word.dueAt = Date.now() + 3600000;
    }
    var today = todayKey();
    if (state.day !== today) { state.day = today; state.dayAnswers = 0; }
    state.dayAnswers++;
    if (state.lastStudy !== today) {
      state.streak = state.lastStudy === yesterdayKey() ? state.streak + 1 : 1;
      state.lastStudy = today;
    }
    study.feedback = { correct: correct, choiceIndex: choiceIndex };
    persist();
    renderStudy();
  }
  function initEvents() {
    document.addEventListener("click", function (event) {
      var nav = event.target.closest("[data-nav]");
      if (nav) { event.preventDefault(); go(nav.getAttribute("data-nav")); return; }
    });
    byId("homePhotoButton").addEventListener("click", function () { openPicker("photo"); });
    byId("homeExcelButton").addEventListener("click", function () { openPicker("excel"); });
    byId("photoUploadCard").addEventListener("click", function () { byId("photoInput").click(); });
    byId("excelUploadCard").addEventListener("click", function () { byId("excelInput").click(); });
    byId("dropZone").addEventListener("click", function () { byId("anyInput").click(); });
    byId("dropZone").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); byId("anyInput").click(); } });
    ["photoInput", "excelInput", "anyInput"].forEach(function (id) {
      byId(id).addEventListener("change", function (e) { acceptFile(e.target.files[0]); });
    });
    ["dragenter", "dragover"].forEach(function (name) {
      byId("dropZone").addEventListener(name, function (e) { e.preventDefault(); e.currentTarget.classList.add("dragging"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      byId("dropZone").addEventListener(name, function (e) { e.preventDefault(); e.currentTarget.classList.remove("dragging"); });
    });
    byId("dropZone").addEventListener("drop", function (e) { acceptFile(e.dataTransfer.files[0]); });
    byId("clearDraft").addEventListener("click", clearDraft);
    byId("parseOcrButton").addEventListener("click", function () {
      draftRows = parseText(byId("ocrText").value).map(curateDraftRow);
      renderDraft();
      byId("reviewSummary").textContent = draftRows.length + "개 후보를 추출했어요. 표에서 수정한 뒤 추가해 주세요.";
      if (!draftRows.length) toast("한 줄에 한 단어씩 적어 주세요.");
    });
    byId("addDraftRow").addEventListener("click", function () { collectDraftInputs(); draftRows.push({ term: "", meaning: "", example: "" }); renderDraft(); byId("draftBody").lastElementChild.querySelector("input").focus(); });
    byId("draftBody").addEventListener("click", function (e) {
      var remove = e.target.closest("[data-remove]");
      if (!remove) return;
      collectDraftInputs();
      draftRows.splice(Number(remove.getAttribute("data-remove")), 1);
      renderDraft();
    });
    byId("saveDraft").addEventListener("click", saveDraft);
    byId("sampleButton").addEventListener("click", function () {
      draftRows = SAMPLE_WORDS.map(function (w) { return Object.assign({}, w); });
      showReview("연습용 예시 단어 6개예요. 마음에 들면 추가해 보세요.", false);
      renderDraft();
    });
    byId("wordSearch").addEventListener("input", renderWords);
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        currentFilter = button.getAttribute("data-filter");
        document.querySelectorAll("[data-filter]").forEach(function (b) { b.classList.toggle("active", b === button); });
        renderWords();
      });
    });
    byId("wordList").addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit]");
      var del = e.target.closest("[data-delete]");
      var save = e.target.closest("[data-save-word]");
      if (edit) editWord(edit.getAttribute("data-edit"));
      if (save) saveWord(save.getAttribute("data-save-word"));
      if (del) {
        var id = del.getAttribute("data-delete");
        if (confirm("이 단어를 삭제할까요?")) {
          state.words = state.words.filter(function (w) { return w.id !== id; });
          persist(); renderWords(); toast("단어를 삭제했어요.");
        }
      }
    });
    byId("exportButton").addEventListener("click", exportCsv);
    byId("studyShell").addEventListener("click", function (e) {
      if (e.target.closest("[data-study-start]") || e.target.closest("[data-study-again]")) { startStudy(); return; }
      if (e.target.closest("[data-memory-hide]")) { study.hidden = true; renderStudy(); return; }
      var choice = e.target.closest("[data-choice]");
      if (choice && study && !study.feedback) {
        var index = Number(choice.getAttribute("data-choice"));
        recordAnswer(study.choiceOptions[index] === study.pool[study.index].meaning, index);
      }
      if (e.target.closest("[data-study-next]") && study) {
        study.index++; study.feedback = null; study.hidden = false; study.choiceOptions = null; renderStudy();
      }
    });
    byId("studyShell").addEventListener("submit", function (e) {
      if (e.target.id !== "answerForm") return;
      e.preventDefault();
      var answer = normalizeTerm(byId("answerInput").value).replace(/[^a-z' -]/g, "");
      recordAnswer(answer === normalizeTerm(study.pool[study.index].term), -1);
    });
  }
  var curatedChanged = enrichSavedWords();
  formatDate();
  initEvents();
  if (curatedChanged) persist();
  else renderDashboard();
  go(["home", "import", "words", "study"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home");
})();
