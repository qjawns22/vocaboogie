(function () {
  "use strict";

  var STORE_KEY = "wordkit-v1";
  var DAILY_GOAL = 30;
  var STANDARD_STUDY_SIZE = 30;
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
  var compose = null;
  var COMPOSE_PROMPTS = {
    "startle": "깜짝 놀랐잖아!", "surprise": "너에게 깜짝 선물이 있어.",
    "blow away": "그 영화는 정말 감동적이었어.", "i can tell": "네가 피곤한 게 보여.",
    "scare": "그 소리에 깜짝 놀랐어.", "pick it up": "내일 다시 이야기하자.",
    "it's on me": "오늘 점심은 내가 살게.", "no wonder": "네가 피곤한 것도 당연해.",
    "grow on": "이 노래가 점점 좋아져.", "take a day off": "하루 쉬어야겠어.",
    "make it": "우리는 제시간에 도착했어.", "find out": "방금 그 소식을 알았어.",
    "look for": "열쇠를 찾고 있어.", "help out": "나 좀 도와줄 수 있어?",
    "figure out": "우리가 방법을 찾을 거야.", "go over": "계획을 다시 살펴보자.",
    "get to know each other": "서로 알아가 보자.", "i'm taking it easy": "이번 주말에는 푹 쉬고 있어.",
    "i was gonna": "전화하려고 했어.", "it's time to": "이제 갈 시간이야.",
    "it's my fault": "내 잘못이야. 내가 고칠게.", "my bad": "미안, 내가 잊었어.",
    "hear out": "내 말을 끝까지 들어줘.", "let it slide": "이번에는 그냥 넘어갈게.",
    "what's wrong?": "무슨 일이야? 내가 도와줄까?", "is everything okay?": "괜찮아? 걱정돼 보여.",
    "recommend": "좋은 카페 하나 추천해 줄래?", "afford": "새 휴대폰을 살 여유가 없어."
  };
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
  function wordDateKey(word) {
    var addedAt = Number(word.addedAt);
    return Number.isFinite(addedAt) && addedAt > 0 ? todayKey(new Date(addedAt)) : "unknown";
  }
  function dateAtNoon(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
  }
  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (Object.prototype.hasOwnProperty.call(saved, "xp")) {
        delete saved.xp;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* 학습 기록은 계속 읽을 수 있어요. */ }
      }
      return {
        words: Array.isArray(saved.words) ? saved.words : [],
        wrongNotes: Array.isArray(saved.wrongNotes) ? saved.wrongNotes.filter(function (note) { return note && typeof note === "object"; }) : [],
        day: saved.day || "",
        dayAnswers: Number(saved.dayAnswers) || 0,
        curatedSeeded: saved.curatedSeeded === true
      };
    } catch (e) {
      return { words: [], wrongNotes: [], day: "", dayAnswers: 0, curatedSeeded: false };
    }
  }
  var syncReady = false, syncVersion = 0, syncUserId = "", syncBase = null, syncTimer = null, syncBusy = false, syncDirty = false;
  function cloneState(value) { return JSON.parse(JSON.stringify(value)); }
  function syncMessage(message) {
    var bar = byId("syncBar"), side = byId("syncStatus");
    if (bar) bar.textContent = message;
    if (side) side.textContent = message;
  }
  function normalizeCloud(value) {
    return {
      words: Array.isArray(value && value.words) ? value.words : [],
      wrongNotes: Array.isArray(value && value.wrongNotes) ? value.wrongNotes : [],
      day: value && typeof value.day === "string" ? value.day : "",
      dayAnswers: Number(value && value.dayAnswers) || 0,
      curatedSeeded: Boolean(value && value.curatedSeeded)
    };
  }
  function mergeRecords(remote, local, base, key) {
    var baseMap = new Map((base || []).map(function (item) { return [String(item[key]), item]; }));
    var localMap = new Map((local || []).map(function (item) { return [String(item[key]), item]; }));
    var result = (remote || []).filter(function (item) {
      var id = String(item[key]);
      return !baseMap.has(id) || localMap.has(id);
    }).map(function (item) {
      var id = String(item[key]), original = baseMap.get(id), edited = localMap.get(id);
      return edited && original && JSON.stringify(edited) !== JSON.stringify(original) ? edited : item;
    });
    var found = new Set(result.map(function (item) { return String(item[key]); }));
    (local || []).forEach(function (item) {
      var id = String(item[key]);
      if (!found.has(id) && (!baseMap.has(id) || (remote || []).some(function (r) { return String(r[key]) === id; }))) {
        result.push(item); found.add(id);
      }
    });
    return result;
  }
  function mergeStates(remote, local, base) {
    var combined = normalizeCloud(remote);
    combined.words = mergeRecords(combined.words, local.words, base && base.words, "id");
    combined.wrongNotes = mergeRecords(combined.wrongNotes, local.wrongNotes, base && base.wrongNotes, "wordId");
    if (!base || local.day !== base.day || local.dayAnswers !== base.dayAnswers) {
      if (combined.day === local.day) combined.dayAnswers = Math.max(combined.dayAnswers, local.dayAnswers);
      else if (local.day > combined.day) { combined.day = local.day; combined.dayAnswers = local.dayAnswers; }
    }
    combined.curatedSeeded = combined.curatedSeeded || local.curatedSeeded;
    return combined;
  }
  function adoptCloud(value) {
    var currentWords = new Map(state.words.map(function (w) { return [String(w.id), w]; }));
    var next = normalizeCloud(value);
    state.words = next.words.map(function (w) {
      var old = currentWords.get(String(w.id));
      return old ? Object.assign(old, w) : w;
    });
    state.wrongNotes = next.wrongNotes;
    state.day = next.day; state.dayAnswers = next.dayAnswers; state.curatedSeeded = next.curatedSeeded;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 서버에 저장됨 */ }
    renderDashboard();
    if (currentPage === "words") renderWords();
    if (currentPage === "mistakes") renderWrongNotes();
  }
  async function cloudRequest(method, data) {
    var response = await fetch("/api/sync", { method: method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
    if (!response.ok) { var error = new Error("동기화 요청 실패"); error.status = response.status; throw error; }
    return response.json();
  }
  async function pushCloud(local, base) {
    for (var attempt = 0; attempt < 5; attempt++) {
      var latest = await cloudRequest("GET");
      var merged = mergeStates(latest.state, local, base);
      try {
        var saved = await cloudRequest("PUT", { state: merged, expectedVersion: latest.version });
        syncVersion = saved.version;
        syncBase = cloneState(merged);
        adoptCloud(syncDirty ? mergeStates(merged, state, local) : merged);
        return;
      } catch (error) { if (error.status !== 409) throw error; }
    }
    throw new Error("동기화 충돌");
  }
  async function flushSync() {
    if (!syncReady || syncBusy || !syncDirty) return;
    syncBusy = true; syncDirty = false;
    var snapshot = cloneState(state), base = cloneState(syncBase);
    try {
      syncMessage("단어장 저장 중…");
      await pushCloud(snapshot, base);
      syncMessage("계정 단어장에 저장됐어요");
    } catch (error) {
      syncDirty = true; syncMessage("연결이 끊겼어요 · 다시 저장 중");
    } finally {
      syncBusy = false;
      if (syncDirty) scheduleSync(4000);
    }
  }
  function scheduleSync(delay) { clearTimeout(syncTimer); syncTimer = setTimeout(flushSync, delay || 600); }
  async function refreshSync() {
    if (!syncReady || syncBusy || syncDirty) return;
    try {
      var latest = await cloudRequest("GET");
      if (latest.version > syncVersion) {
        syncVersion = latest.version;
        syncBase = cloneState(latest.state);
        adoptCloud(latest.state);
        syncMessage("다른 기기의 단어장을 가져왔어요");
      }
    } catch (error) { syncMessage("연결 확인 중…"); }
  }
  async function initializeSync() {
    syncMessage("계정 단어장 연결 중…");
    try {
      var latest = await cloudRequest("GET");
      syncUserId = latest.userId;
      var marker = "wordkit-cloud-imported-" + syncUserId;
      if (!localStorage.getItem(marker)) {
        try { localStorage.setItem("wordkit-before-cloud-v1", JSON.stringify(state)); } catch (e) { /* 백업 저장 공간 부족 */ }
        await pushCloud(cloneState(state), null);
        localStorage.setItem(marker, "1");
      } else if (latest.state) {
        syncVersion = latest.version; syncBase = cloneState(latest.state);
        adoptCloud(latest.state);
      } else {
        await pushCloud(cloneState(state), null);
      }
      syncReady = true;
      syncMessage("계정 단어장에 저장됐어요");
      window.addEventListener("focus", refreshSync);
      document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshSync(); });
      setInterval(refreshSync, 15000);
    } catch (error) { syncMessage("계정 단어장에 연결할 수 없어요 · 다시 시도 중"); setTimeout(initializeSync, 5000); }
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("이 브라우저에 저장할 수 없어요. 저장 공간을 확인해 주세요."); }
    renderDashboard();
    if (syncReady) { syncDirty = true; scheduleSync(); }
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
    byId("pageLabel").textContent = { home: "홈", import: "가져오기", words: "내 단어장", study: "학습하기", compose: "영작 연습", mistakes: "오답노트" }[page];
    if (page === "words") renderWords();
    if (page === "study") renderStudy();
    if (page === "compose") renderCompose();
    if (page === "mistakes") renderWrongNotes();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "#" + page);
  }
  function renderDashboard() {
    var daily = state.day === todayKey() ? state.dayAnswers : 0;
    byId("todayLearned").textContent = Math.min(daily, DAILY_GOAL);
    byId("todayProgressBar").style.width = Math.min(100, daily / DAILY_GOAL * 100) + "%";
    byId("todaySubtext").textContent = daily >= DAILY_GOAL ? "오늘의 목표를 달성했어요! ✦" : daily ? (DAILY_GOAL - Math.min(daily, DAILY_GOAL)) + "단어만 더 보면 목표 달성" : "첫 단어를 기다리고 있어요";
    byId("totalWords").textContent = state.words.length;
    byId("sideWordCount").textContent = state.words.length;
    byId("wrongNoteCount").textContent = state.wrongNotes.length;
    byId("sideMistakeCount").textContent = state.wrongNotes.length;
    var recent = state.words.slice().sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); }).slice(0, 4);
    byId("recentWords").innerHTML = recent.length ? recent.map(function (w) {
      return '<div class="recent-item"><strong>' + escapeHtml(w.term) + '</strong><span>' + escapeHtml(w.meaning || "뜻을 추가해 주세요") + '</span></div>';
    }).join("") : '<p class="empty-mini">아직 단어가 없어요.<br>사진이나 엑셀을 올려 첫 단어장을 만들어 보세요.</p>';
  }
  function renderWrongNotes() {
    var holder = byId("mistakeList");
    if (!state.wrongNotes.length) {
      holder.innerHTML = '<div class="empty-state"><div class="empty-illustration">↺</div><h3>아직 오답이 없어요</h3><p>이제부터 학습에서 틀린 문제가 답과 정답과 함께 이곳에 모여요.</p><button class="btn btn-dark" data-nav="study">학습하러 가기 →</button></div>';
      return;
    }
    holder.innerHTML = state.wrongNotes.slice().sort(function (a, b) { return Number(b.wrongAt || 0) - Number(a.wrongAt || 0); }).map(function (note) {
      var mode = note.mode === "choice" ? "뜻 고르기" : note.mode === "memory" ? "기억 카드" : note.mode === "compose" ? "영작 연습" : "단어 쓰기";
      var date = Number(note.wrongAt) ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(Number(note.wrongAt))) : "";
      return '<article class="mistake-card"><div class="mistake-head"><div><span class="mistake-kind">' + mode + '</span><h2>' + escapeHtml(note.term) + '</h2><p>' + escapeHtml(note.meaning || "뜻이 없는 단어") + '</p></div><div class="mistake-meta">' + (date ? '<span>' + date + '</span>' : "") + '<span>' + (Number(note.misses) || 1) + '번 틀림</span></div></div><div class="mistake-answers"><div class="mistake-answer my-answer"><span>내 답</span><strong>' + escapeHtml(note.submittedAnswer || "답을 입력하지 않았어요") + '</strong></div><div class="mistake-answer right-answer"><span>정답</span><strong>' + escapeHtml(note.correctAnswer) + '</strong></div></div>' + (note.example ? '<div class="mistake-example"><span>회화 예문</span><p>' + escapeHtml(note.example) + '</p></div>' : "") + '</article>';
    }).join("");
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
        workerPath: new URL("/legacy/tesseract-worker.min.js", location.href).href,
        corePath: new URL("/legacy/ocr/core", location.href).href,
        langPath: new URL("/legacy/ocr/lang", location.href).href,
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
    var dateSelect = byId("wordDateFilter");
    var selectedDate = dateSelect.value;
    var dateFormatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
    var dates = Array.from(new Set(state.words.map(wordDateKey))).sort().reverse();
    dateSelect.innerHTML = '<option value="all">모든 날짜</option>' + dates.map(function (key) {
      var label = key === "unknown" ? "날짜 정보 없음" : dateFormatter.format(new Date(key + "T12:00:00"));
      return '<option value="' + key + '">' + escapeHtml(label) + ' (' + state.words.filter(function (w) { return wordDateKey(w) === key; }).length + '개)</option>';
    }).join("");
    dateSelect.value = dates.includes(selectedDate) ? selectedDate : "all";
    var now = Date.now();
    var list = state.words.slice().sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); }).filter(function (w) {
      if (dateSelect.value !== "all" && wordDateKey(w) !== dateSelect.value) return false;
      if (search && !(normalizeTerm(w.term + " " + w.meaning + " " + w.example).includes(search))) return false;
      if (currentFilter === "mastered" && Number(w.level || 0) < 3) return false;
      return true;
    });
    var holder = byId("wordList");
    if (!list.length) {
      holder.innerHTML = '<div class="empty-state"><div class="empty-illustration">✦</div><h3>' + (state.words.length ? "조건에 맞는 단어가 없어요" : "첫 단어장을 만들어 볼까요?") + '</h3><p>' + (state.words.length ? "검색어나 필터를 바꿔 보세요." : "사진이나 엑셀을 올려 나만의 단어를 모아 보세요.") + '</p>' + (state.words.length ? "" : '<button class="btn btn-dark" data-nav="import">단어 가져오기 →</button>') + '</div>';
      return;
    }
    var groups = new Map();
    list.forEach(function (word) {
      var key = wordDateKey(word);
      if (!groups.has(key)) groups.set(key, { key: key, label: key === "unknown" ? "날짜 정보 없음" : dateFormatter.format(new Date(Number(word.addedAt))), words: [] });
      groups.get(key).words.push(word);
    });
    holder.innerHTML = Array.from(groups.values()).map(function (group) {
      var rows = group.words.map(function (w) {
        var level = Number(w.level) || 0;
        var marker = level >= 3 ? "mastered" : w.dueAt && w.dueAt <= now ? "ready" : "";
        return '<article class="word-row" data-id="' + escapeHtml(w.id) + '"><div class="word-main"><strong>' + escapeHtml(w.term) + '</strong><small>' + (level >= 3 ? "익숙한 단어" : level ? "복습 중" : "새 단어") + '</small></div><div class="word-meaning">' + escapeHtml(w.meaning || "뜻을 추가해 주세요") + '</div><div class="word-example"><span>회화 예문</span>' + escapeHtml(w.example || "예문을 추가해 보세요") + '</div><div class="word-actions"><span class="mastery-dot ' + marker + '" aria-hidden="true"></span><button data-edit="' + escapeHtml(w.id) + '" aria-label="' + escapeHtml(w.term) + ' 수정">✎</button><button data-delete="' + escapeHtml(w.id) + '" aria-label="' + escapeHtml(w.term) + ' 삭제">×</button></div></article>';
      }).join("");
      return '<section class="word-date-group" data-date-key="' + group.key + '" aria-label="' + escapeHtml(group.label) + '"><div class="word-date-heading"><h2>' + escapeHtml(group.label) + '</h2><span>' + group.words.length + '개</span><button type="button" class="date-study-button" data-study-date="' + group.key + '" aria-label="' + escapeHtml(group.label) + ' 단어만 학습">이 날짜 학습 →</button><button type="button" data-edit-group-date="' + group.key + '" aria-label="' + escapeHtml(group.label) + ' 날짜 수정">날짜 수정</button><button type="button" class="date-delete-button" data-delete-group-date="' + group.key + '" aria-label="' + escapeHtml(group.label) + ' 단어 전체 삭제">이 날짜 삭제</button></div><div class="word-date-items">' + rows + '</div></section>';
    }).join("");
  }
  function editWord(id) {
    var word = state.words.find(function (w) { return w.id === id; });
    var row = Array.from(document.querySelectorAll(".word-row")).find(function (el) { return el.getAttribute("data-id") === id; });
    if (!word || !row) return;
    if (row.querySelector(".word-edit")) { row.querySelector(".word-edit").remove(); return; }
    var savedDate = wordDateKey(word);
    row.insertAdjacentHTML("beforeend", '<div class="word-edit"><label>영단어<input data-edit-field="term" value="' + escapeHtml(word.term) + '"></label><label>뜻<input data-edit-field="meaning" value="' + escapeHtml(word.meaning) + '"></label><label>예문<input data-edit-field="example" value="' + escapeHtml(word.example) + '"></label><label>추가 날짜<input type="date" data-edit-field="date" value="' + (savedDate === "unknown" ? "" : savedDate) + '"></label><button class="btn btn-dark" data-save-word="' + escapeHtml(id) + '">저장</button></div>');
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
    var dateValue = edit.querySelector('[data-edit-field="date"]').value;
    var currentDate = wordDateKey(word);
    if (!dateValue && currentDate !== "unknown") { toast("추가 날짜를 선택해 주세요."); return; }
    var changedDate = dateValue && dateValue !== currentDate ? dateAtNoon(dateValue) : null;
    if (dateValue && dateValue !== currentDate && changedDate === null) { toast("올바른 날짜를 선택해 주세요."); return; }
    word.term = term;
    word.meaning = edit.querySelector('[data-edit-field="meaning"]').value.trim();
    word.example = edit.querySelector('[data-edit-field="example"]').value.trim();
    if (changedDate !== null) word.addedAt = changedDate;
    persist(); renderWords(); toast("단어를 수정했어요.");
  }
  function dateGroup(key) {
    return Array.from(document.querySelectorAll(".word-date-group")).find(function (group) { return group.getAttribute("data-date-key") === key; });
  }
  function confirmGroupDelete(key) {
    var group = dateGroup(key);
    if (!group) return;
    if (group.querySelector(".group-date-delete")) { group.querySelector(".group-date-delete").remove(); return; }
    document.querySelectorAll(".group-date-delete, .group-date-edit").forEach(function (el) { el.remove(); });
    var count = state.words.filter(function (word) { return wordDateKey(word) === key; }).length;
    var label = group.querySelector("h2").textContent;
    group.querySelector(".word-date-heading").insertAdjacentHTML("afterend", '<div class="group-date-delete"><p><strong>' + escapeHtml(label) + '</strong>에 저장된 단어 ' + count + '개를 삭제할까요? 이 날짜의 모든 단어와 관련 오답 기록이 삭제돼요.</p><button type="button" class="btn btn-dark" data-confirm-group-delete="' + key + '">' + count + '개 삭제</button><button type="button" class="btn btn-outline" data-cancel-group-delete>취소</button></div>');
  }
  function deleteGroupDate(key) {
    var ids = new Set(state.words.filter(function (word) { return wordDateKey(word) === key; }).map(function (word) { return word.id; }));
    if (!ids.size) return;
    state.words = state.words.filter(function (word) { return !ids.has(word.id); });
    state.wrongNotes = state.wrongNotes.filter(function (note) { return !ids.has(note.wordId); });
    study = null; compose = null;
    persist(); renderWords();
    toast(ids.size + "개 단어를 삭제했어요.");
  }
  function editGroupDate(key) {
    var group = dateGroup(key);
    if (!group) return;
    if (group.querySelector(".group-date-edit")) { group.querySelector(".group-date-edit").remove(); return; }
    document.querySelectorAll(".group-date-edit").forEach(function (editor) { editor.remove(); });
    var count = state.words.filter(function (word) { return wordDateKey(word) === key; }).length;
    group.querySelector(".word-date-heading").insertAdjacentHTML("afterend", '<div class="group-date-edit"><label>새 날짜<input type="date" data-group-date-input value="' + (key === "unknown" ? "" : key) + '"></label><p>이 날짜에 저장된 모든 단어 ' + count + '개에 적용돼요.</p><button type="button" class="btn btn-dark" data-save-group-date="' + key + '">적용</button><button type="button" class="btn btn-outline" data-cancel-group-date>취소</button></div>');
    group.querySelector("[data-group-date-input]").focus();
  }
  function saveGroupDate(key) {
    var group = dateGroup(key);
    if (!group) return;
    var dateValue = group.querySelector("[data-group-date-input]").value;
    var addedAt = dateAtNoon(dateValue);
    if (addedAt === null) { toast("올바른 날짜를 선택해 주세요."); return; }
    if (dateValue === key) { group.querySelector(".group-date-edit").remove(); return; }
    var words = state.words.filter(function (word) { return wordDateKey(word) === key; }).sort(function (a, b) { return Number(b.addedAt || 0) - Number(a.addedAt || 0); });
    words.forEach(function (word, index) { word.addedAt = addedAt + words.length - index; });
    persist(); renderWords(); toast(words.length + "개 단어의 날짜를 바꿨어요.");
  }
  function exportCsv() {
    if (!state.words.length) { toast("내보낼 단어가 없어요."); return; }
    var quote = function (v) { return '"' + String(v || "").replace(/"/g, '""') + '"'; };
    var content = "\uFEFF" + [["단어", "뜻", "예문"], ...state.words.map(function (w) { return [w.term, w.meaning, w.example]; })].map(function (r) { return r.map(quote).join(","); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = url; link.download = "vocabooki-words-" + todayKey() + ".csv";
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
  function startStudy(dateKey) {
    var selected = dateKey == null ? state.words : state.words.filter(function (word) { return wordDateKey(word) === dateKey; });
    if (!selected.length) { go("words"); toast("선택한 날짜에 단어가 없어요."); return; }
    var now = Date.now();
    var due = shuffle(selected.filter(function (w) { return Number(w.dueAt || 0) <= now; }));
    var later = shuffle(selected.filter(function (w) { return Number(w.dueAt || 0) > now; }));
    var pool = dateKey == null ? due.concat(later).slice(0, STANDARD_STUDY_SIZE) : due.concat(later);
    study = { pool: pool, index: 0, correct: 0, feedback: null, hidden: false, choiceOptions: null, dateKey: dateKey == null ? null : dateKey, dateCount: selected.length };
    go("study"); renderStudy();
  }
  function currentQuestionMode(word) {
    var source = study.dateKey === null ? state.words : study.pool;
    var meanings = new Set(source.filter(function (w) { return w.meaning; }).map(function (w) { return w.meaning; }));
    if (word.meaning && meanings.size >= 4 && study.index % 2 === 0) return "choice";
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
      var dates = new Map();
      state.words.forEach(function (word) { var key = wordDateKey(word); dates.set(key, (dates.get(key) || 0) + 1); });
      var dateButtons = Array.from(dates).sort(function (a, b) { return a[0] === "unknown" ? 1 : b[0] === "unknown" ? -1 : b[0].localeCompare(a[0]); }).map(function (entry) {
        var label = entry[0] === "unknown" ? "날짜 정보 없음" : entry[0];
        return '<button type="button" data-study-date="' + entry[0] + '"><strong>' + escapeHtml(label) + '</strong><span>' + entry[1] + '개 단어 →</span></button>';
      }).join("");
      shell.innerHTML = '<div class="study-welcome"><div class="study-graphic">✦</div><span class="kicker">READY FOR A QUICK ROUND?</span><h2>오늘의 단어를 만나볼까요?</h2><p>전체 학습은 최대 30문제예요.<br>날짜를 고르면 그날의 단어를 전부 공부할 수 있어요.</p><button class="btn btn-dark" data-study-start>전체 단어 학습 →</button><div class="study-small">단어장 ' + state.words.length + '개 · 틀린 문제는 오답노트에 모여요</div><div class="study-date-picker"><h3>날짜별로 학습하기</h3><div class="study-date-grid">' + dateButtons + '</div></div></div>';
      return;
    }
    if (study.index >= study.pool.length) {
      var scope = study.dateKey === null ? "전체 단어" : study.dateKey === "unknown" ? "날짜 정보 없음" : study.dateKey;
      shell.innerHTML = '<div class="study-result"><div class="result-stars">✦ ✧ ✦</div><span class="kicker">ROUND COMPLETE · ' + escapeHtml(scope) + '</span><h2>오늘도 해냈어요!</h2><p>조금씩 반복한 단어가 오래 남아요.<br>헷갈린 단어는 오답노트에서 다시 살펴봐요.</p><div class="result-metrics"><span><strong>' + study.correct + '/' + study.pool.length + '</strong>기억한 단어</span><span><strong>' + (study.pool.length - study.correct) + '</strong>틀린 문제</span></div><div class="study-result-actions"><button class="btn btn-dark" data-study-again data-date-key="' + escapeHtml(study.dateKey || "") + '">같은 범위 다시 학습 →</button><button class="btn btn-outline" data-study-all>다른 날짜 고르기</button><button class="btn btn-outline" data-nav="mistakes">오답노트 보기 →</button></div></div>';
      study = null;
      return;
    }
    var word = study.pool[study.index];
    var mode = currentQuestionMode(word);
    var answered = !!study.feedback;
    var studyLabel = study.dateKey === null ? "전체 단어 학습" : (study.dateKey === "unknown" ? "날짜 정보 없음" : study.dateKey) + " 단어 학습";
    var head = '<div class="study-card"><div class="study-head"><span>' + escapeHtml(studyLabel) + '</span><span>' + (study.index + 1) + ' / ' + study.pool.length + '</span></div><div class="study-progress"><span style="width:' + Math.round((study.index / study.pool.length) * 100) + '%"></span></div>';
    var body = "";
    if (mode === "choice") {
      if (!study.choiceOptions) {
        var optionsPool = study.dateKey === null ? state.words : study.pool;
        var wrong = shuffle(Array.from(new Set(optionsPool.filter(function (w) { return w.id !== word.id && w.meaning && w.meaning !== word.meaning; }).map(function (w) { return w.meaning; })))).slice(0, 3);
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
      body += '<div class="feedback' + (study.feedback.correct ? "" : " wrong") + '">' + (study.feedback.correct ? "정답이에요!" : "오답노트에 모아뒀어요.") + '<small>정답: ' + escapeHtml(word.term) + (word.meaning ? " · " + escapeHtml(word.meaning) : "") + '</small>' + (word.example ? '<span class="study-example">' + escapeHtml(word.example) + '</span>' : "") + '</div>';
    }
    body += '<div class="question-bottom"><small>' + (answered ? "헷갈린 단어는 더 자주 나와요." : "천천히 생각해도 괜찮아요.") + '</small>' + (answered ? '<button class="btn btn-dark" data-study-next>다음 단어 →</button>' : "") + '</div></div>';
    shell.innerHTML = head + body;
    if (mode !== "choice" && (study.hidden || mode === "type") && !answered) byId("answerInput").focus();
  }
  function recordAnswer(correct, choiceIndex, submittedAnswer) {
    if (!study || study.feedback) return;
    var word = study.pool[study.index];
    var intervals = [1, 3, 7, 14, 30, 60];
    if (correct) {
      word.level = Math.min(6, (Number(word.level) || 0) + 1);
      word.dueAt = Date.now() + intervals[Math.min(word.level - 1, intervals.length - 1)] * 86400000;
      study.correct++;
    } else {
      word.level = 0;
      word.dueAt = Date.now() + 3600000;
      var mode = currentQuestionMode(word);
      var wordId = String(word.id || normalizeTerm(word.term));
      var note = state.wrongNotes.find(function (item) { return item.wordId === wordId; });
      var details = {
        wordId: wordId,
        term: word.term,
        meaning: word.meaning || "",
        example: word.example || "",
        mode: mode,
        submittedAnswer: mode === "choice" ? String(study.choiceOptions[choiceIndex] || "") : String(submittedAnswer || "").trim(),
        correctAnswer: mode === "choice" ? word.meaning : word.term,
        wrongAt: Date.now()
      };
      if (note) Object.assign(note, details, { misses: (Number(note.misses) || 1) + 1 });
      else state.wrongNotes.push(Object.assign({ misses: 1 }, details));
    }
    var today = todayKey();
    if (state.day !== today) { state.day = today; state.dayAnswers = 0; }
    state.dayAnswers++;
    study.feedback = { correct: correct, choiceIndex: choiceIndex };
    persist();
    renderStudy();
  }
  function startCompose() {
    var eligible = state.words.filter(function (word) { return String(word.meaning || "").trim(); });
    var guided = shuffle(eligible.filter(function (word) { return COMPOSE_PROMPTS[normalizeTerm(word.term)]; }));
    var open = shuffle(eligible.filter(function (word) { return !COMPOSE_PROMPTS[normalizeTerm(word.term)]; }));
    var pool = shuffle(guided.slice(0, 5).concat(open).concat(guided.slice(5)).slice(0, 10));
    compose = { pool: pool, index: 0, confident: 0, draft: null, feedback: null, retryText: "", pending: false };
    renderCompose();
  }
  function renderCompose() {
    var shell = byId("composeShell");
    var eligible = state.words.filter(function (word) { return String(word.meaning || "").trim(); });
    if (!eligible.length) {
      shell.innerHTML = '<div class="study-welcome"><div class="study-graphic">✎</div><h2>뜻이 있는 단어를 추가해 주세요</h2><p>단어와 한국어 뜻을 저장하면 영작 연습을 시작할 수 있어요.</p><button class="btn btn-dark" data-nav="import">단어 가져오기 →</button></div>';
      return;
    }
    if (!compose) {
      shell.innerHTML = '<div class="study-welcome"><div class="study-graphic">✎</div><span class="kicker">YOUR WORDS, YOUR SENTENCES</span><h2>한국어를 영어로 써 볼까요?</h2><p>내 단어장의 뜻을 단서로 영어 문장을 직접 써 보세요.<br>답안을 내면 AI가 짧게 평가하고 자연스러운 문장을 제안해요.</p><button class="btn btn-dark" data-compose-start>영작 시작하기 →</button><div class="study-small">한 번에 최대 10문제 · 예문은 가능한 답 중 하나예요</div></div>';
      return;
    }
    if (compose.index >= compose.pool.length) {
      var total = compose.pool.length;
      shell.innerHTML = '<div class="study-result"><div class="result-stars">✦ ✧ ✦</div><span class="kicker">WRITING COMPLETE</span><h2>영작 연습을 마쳤어요!</h2><p>내 문장과 예문을 비교한 것만으로도 좋은 연습이에요.<br>다시 보고 싶은 문장은 오답노트에서 확인해요.</p><div class="result-metrics"><span><strong>' + compose.confident + '/' + total + '</strong>잘 쓴 문장</span><span><strong>' + (total - compose.confident) + '</strong>다시 볼 문장</span></div><div class="study-result-actions"><button class="btn btn-dark" data-compose-again>새 문제 풀기 →</button><button class="btn btn-outline" data-nav="mistakes">오답노트 보기 →</button></div></div>';
      compose = null;
      return;
    }
    var word = compose.pool[compose.index];
    var prompt = COMPOSE_PROMPTS[normalizeTerm(word.term)] || '“' + word.meaning + '”의 의미를 담아 짧은 영어 문장을 써 보세요.';
    var answered = compose.draft !== null;
    var example = String(word.example || "").trim();
    var answerPanel;
    if (answered) {
      var feedback = compose.feedback || window.WordkitComposeFeedback(compose.draft, word);
      answerPanel = '<div class="compose-feedback compose-feedback-' + feedback.tone + '" role="status"><span class="compose-feedback-kicker">' + (feedback.source === "ai" ? "AI 평가" : "기본 점검") + '</span><h3>' + escapeHtml(feedback.title) + '</h3>' +
        (feedback.fallback ? '<p class="compose-feedback-note">' + escapeHtml(feedback.fallbackMessage || "AI 평가를 불러오지 못해 기본 점검을 보여드려요.") + '</p>' : "") +
        (feedback.notes.length ? '<ul>' + feedback.notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join("") + '</ul>' : feedback.source === "ai" ? "" : '<p class="compose-feedback-note">기본 표기에서 고칠 부분은 찾지 못했어요.</p>') +
        ((feedback.changed || !feedback.usedTerm) && feedback.suggestion ? '<div class="compose-suggestion"><span>' + escapeHtml(feedback.suggestionLabel) + '</span><p>' + escapeHtml(feedback.suggestion) + '</p></div>' : "") + '</div>' +
        '<div class="compose-comparison"><div><span>내 답안</span><p>' + escapeHtml(compose.draft) + '</p></div><div><span>단어장 예문</span><p>' + escapeHtml(example || "저장된 예문이 없어요.") + '</p><small>활용 단어: ' + escapeHtml(word.term) + '</small></div></div>' +
        '<p class="compose-guidance">' + (feedback.source === "ai" ? "AI 제안을 참고해 내 문장을 다시 살펴보세요. 다른 자연스러운 답도 가능해요." : "단어 사용과 기본 표기를 점검했어요. 다른 자연스러운 문장도 정답일 수 있으니, 예문을 참고해 직접 판단해 주세요.") + '</p>' +
        '<div class="compose-actions"><button class="btn btn-outline" data-compose-retry>고쳐 다시 쓰기</button><button class="btn btn-dark" data-compose-confident>잘 썼어요 →</button><button class="btn btn-outline" data-compose-review>다시 연습할래요 →</button></div>';
    } else {
      answerPanel = '<form id="composeForm" class="compose-form"><label for="composeInput">내 영어 문장</label><textarea id="composeInput" rows="3" maxlength="600" placeholder="영어로 자유롭게 써 보세요" aria-label="영어 문장" required>' + escapeHtml(compose.retryText || "") + '</textarea><button class="btn btn-dark" type="submit">AI로 답안 평가하기 →</button></form>';
    }
    shell.innerHTML = '<div class="study-card compose-card"><div class="study-head"><span>영작 연습</span><span>' + (compose.index + 1) + ' / ' + compose.pool.length + '</span></div><div class="study-progress"><span style="width:' + Math.round((compose.index / compose.pool.length) * 100) + '%"></span></div><span class="question-tag">한국어 → 영어</span><p class="question-prompt">한국어를 읽고 영어로 답해 보세요.</p><h2 class="compose-prompt">' + escapeHtml(prompt) + '</h2>' + answerPanel + '</div>';
  }
  function finishComposeQuestion(confident) {
    if (!compose || compose.draft === null) return;
    var word = compose.pool[compose.index];
    if (confident) compose.confident++;
    else {
      var wordId = String(word.id || normalizeTerm(word.term));
      var note = state.wrongNotes.find(function (item) { return item.wordId === wordId; });
      var details = { wordId: wordId, term: word.term, meaning: word.meaning || "", example: word.example || "", mode: "compose", submittedAnswer: compose.draft, correctAnswer: word.example || word.term, wrongAt: Date.now() };
      if (note) Object.assign(note, details, { misses: (Number(note.misses) || 1) + 1 });
      else state.wrongNotes.push(Object.assign({ misses: 1 }, details));
    }
    var today = todayKey();
    if (state.day !== today) { state.day = today; state.dayAnswers = 0; }
    state.dayAnswers++;
    compose.index++;
    compose.draft = null;
    compose.feedback = null;
    compose.retryText = "";
    persist();
    renderCompose();
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
    byId("wordDateFilter").addEventListener("change", renderWords);
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        currentFilter = button.getAttribute("data-filter");
        document.querySelectorAll("[data-filter]").forEach(function (b) { b.classList.toggle("active", b === button); });
        renderWords();
      });
    });
    byId("wordList").addEventListener("click", function (e) {
      var deleteDate = e.target.closest("[data-delete-group-date]");
      var confirmDeleteDate = e.target.closest("[data-confirm-group-delete]");
      var cancelDeleteDate = e.target.closest("[data-cancel-group-delete]");
      if (deleteDate) { confirmGroupDelete(deleteDate.getAttribute("data-delete-group-date")); return; }
      if (confirmDeleteDate) { deleteGroupDate(confirmDeleteDate.getAttribute("data-confirm-group-delete")); return; }
      if (cancelDeleteDate) { cancelDeleteDate.closest(".group-date-delete").remove(); return; }
      var studyDate = e.target.closest("[data-study-date]");
      if (studyDate) { startStudy(studyDate.getAttribute("data-study-date")); return; }
      var editDate = e.target.closest("[data-edit-group-date]");
      var saveDate = e.target.closest("[data-save-group-date]");
      var cancelDate = e.target.closest("[data-cancel-group-date]");
      if (editDate) { editGroupDate(editDate.getAttribute("data-edit-group-date")); return; }
      if (saveDate) { saveGroupDate(saveDate.getAttribute("data-save-group-date")); return; }
      if (cancelDate) { cancelDate.closest(".group-date-edit").remove(); return; }
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
      var dateButton = e.target.closest("[data-study-date]");
      if (dateButton) { startStudy(dateButton.getAttribute("data-study-date")); return; }
      if (e.target.closest("[data-study-all]")) { study = null; renderStudy(); return; }
      if (e.target.closest("[data-study-start]")) { startStudy(null); return; }
      var again = e.target.closest("[data-study-again]");
      if (again) { startStudy(again.getAttribute("data-date-key") || null); return; }
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
      var submittedAnswer = byId("answerInput").value.trim();
      var answer = normalizeTerm(submittedAnswer).replace(/[^a-z' -]/g, "");
      recordAnswer(answer === normalizeTerm(study.pool[study.index].term), -1, submittedAnswer);
    });
    byId("composeShell").addEventListener("click", function (e) {
      if (e.target.closest("[data-compose-start], [data-compose-again]")) { startCompose(); return; }
      if (e.target.closest("[data-compose-retry]") && compose && compose.draft !== null) {
        compose.retryText = compose.draft;
        compose.draft = null;
        compose.feedback = null;
        renderCompose();
        byId("composeInput").focus();
        return;
      }
      if (e.target.closest("[data-compose-confident]")) { finishComposeQuestion(true); return; }
      if (e.target.closest("[data-compose-review]")) { finishComposeQuestion(false); }
    });
    byId("composeShell").addEventListener("submit", async function (e) {
      if (e.target.id !== "composeForm" || !compose || compose.draft !== null) return;
      e.preventDefault();
      if (compose.pending) return;
      var answer = byId("composeInput").value.trim();
      if (!answer) { toast("영어 문장을 먼저 써 주세요."); return; }
      var session = compose;
      var word = session.pool[session.index];
      var prompt = COMPOSE_PROMPTS[normalizeTerm(word.term)] || '“' + word.meaning + '”의 의미를 담아 짧은 영어 문장을 써 보세요.';
      var button = e.target.querySelector('button[type="submit"]');
      session.pending = true;
      button.disabled = true;
      button.textContent = "AI가 평가 중…";
      try {
        var response = await fetch("/api/compose-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: answer, prompt: prompt, term: word.term, meaning: word.meaning || "", example: word.example || "" })
        });
        if (!response.ok) {
          var failure = await response.json().catch(function () { return null; });
          var requestError = new Error("AI 평가 실패");
          requestError.code = failure && failure.code;
          throw requestError;
        }
        var result = await response.json();
        if (!result.feedback || !["good", "polish", "review"].includes(result.feedback.tone) || !Array.isArray(result.feedback.notes)) throw new Error("평가 형식 오류");
        if (compose !== session) return;
        session.feedback = result.feedback;
      } catch (error) {
        if (compose !== session) return;
        session.feedback = Object.assign(window.WordkitComposeFeedback(answer, word), {
          source: "basic",
          fallback: true,
          fallbackMessage: error && error.code === "no_credits" ? "OpenAI API 크레딧이 없어 기본 점검을 보여드려요." : "AI 평가를 불러오지 못해 기본 점검을 보여드려요."
        });
      } finally {
        if (compose === session) {
          session.pending = false;
          session.draft = answer;
          session.retryText = "";
          renderCompose();
        }
      }
    });
  }
  var curatedChanged = enrichSavedWords();
  formatDate();
  initEvents();
  if (curatedChanged) persist();
  else renderDashboard();
  go(["home", "import", "words", "study", "compose", "mistakes"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home");
  initializeSync();
})();
