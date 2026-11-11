(function () {
  "use strict";

  function plain(value) {
    return String(value || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function forms(token) {
    var irregular = {
      be: ["am", "is", "are", "was", "were", "been", "being"],
      do: ["does", "did", "done", "doing"],
      go: ["goes", "went", "gone", "going"],
      get: ["gets", "got", "gotten", "getting"],
      have: ["has", "had", "having"],
      make: ["makes", "made", "making"],
      take: ["takes", "took", "taken", "taking"],
      find: ["finds", "found", "finding"],
      hear: ["hears", "heard", "hearing"],
      buy: ["buys", "bought", "buying"],
      tell: ["tells", "told", "telling"],
      feel: ["feels", "felt", "feeling"],
      say: ["says", "said", "saying"],
      blow: ["blows", "blew", "blown", "blowing"],
      fight: ["fights", "fought", "fighting"],
      pay: ["pays", "paid", "paying"],
      stick: ["sticks", "stuck", "sticking"],
      leave: ["leaves", "left", "leaving"],
      lose: ["loses", "lost", "losing"],
      come: ["comes", "came", "coming"],
      grow: ["grows", "grew", "grown", "growing"]
    };
    var result = [token].concat(irregular[token] || []);
    if (token.length < 3 || /[^a-z]/.test(token)) return result;
    result.push(token + "s", token + "ed", token + "ing");
    if (token.endsWith("e")) result.push(token + "d", token.slice(0, -1) + "ing");
    if (token.endsWith("y")) result.push(token.slice(0, -1) + "ies", token.slice(0, -1) + "ied");
    if (token.endsWith("n")) result.push(token + "ning");
    return result;
  }

  function usesTerm(answer, term) {
    var words = plain(answer).split(" ").filter(Boolean);
    var target = plain(term).split(" ").filter(Boolean);
    if (!target.length) return false;
    if (target.length === 1) return words.some(function (word) { return forms(target[0]).includes(word); });
    for (var start = 0; start <= words.length - target.length; start++) {
      if (target.every(function (word, index) { return forms(word).includes(words[start + index]); })) return true;
    }
    if (target.length === 2 && ["up", "out", "off", "on", "over", "back", "in"].includes(target[1])) {
      for (var index = 0; index < words.length - 2; index++) {
        if (forms(target[0]).includes(words[index]) && ["me", "you", "him", "her", "it", "us", "them"].includes(words[index + 1]) && words[index + 2] === target[1]) return true;
      }
    }
    if (plain(term) === "it's on me") return /\bon me\b/.test(plain(answer));
    var ignored = new Set(["i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "our", "its", "it's", "someone", "something", "one", "ones", "a", "an", "the", "to", "be", "am", "is", "are", "was", "were", "have", "has", "had", "can", "could", "will", "would", "do", "did"]);
    var salient = target.filter(function (word) { return !ignored.has(word); });
    if (salient.length < 2) return false;
    var cursor = -1;
    return salient.every(function (word) {
      var limit = cursor < 0 ? words.length : Math.min(words.length, cursor + 6);
      for (var position = cursor + 1; position < limit; position++) {
        if (forms(word).includes(words[position])) { cursor = position; return true; }
      }
      return false;
    });
  }

  function basicCorrections(answer) {
    var text = String(answer || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
    var tips = [];
    function replace(pattern, replacement, tip) {
      var updated = text.replace(pattern, replacement);
      if (updated !== text) { text = updated; if (!tips.includes(tip)) tips.push(tip); }
    }
    replace(/\bim\b/gi, "I'm", "I'm처럼 줄임말에 작은따옴표를 넣어 주세요.");
    replace(/\bdont\b/gi, "don't", "don't처럼 줄임말에 작은따옴표를 넣어 주세요.");
    replace(/\bcant\b/gi, "can't", "can't처럼 줄임말에 작은따옴표를 넣어 주세요.");
    replace(/\bwont\b/gi, "won't", "won't처럼 줄임말에 작은따옴표를 넣어 주세요.");
    replace(/\bI is\b/gi, "I am", "I 다음에는 am을 써 주세요.");
    replace(/\b(he|she|it) are\b/gi, function (_, subject) { return subject + " is"; }, "he/she/it 다음에는 is를 써 주세요.");
    replace(/\b(you|we|they) is\b/gi, function (_, subject) { return subject + " are"; }, "you/we/they 다음에는 are를 써 주세요.");
    replace(/\bI has\b/gi, "I have", "I 다음에는 have를 써 주세요.");
    replace(/\b(he|she|it) have\b/gi, function (_, subject) { return subject + " has"; }, "he/she/it 다음에는 has를 써 주세요.");
    if (/^[a-z]/.test(text)) { text = text[0].toUpperCase() + text.slice(1); tips.push("문장 첫 글자를 대문자로 써 주세요."); }
    if (text && !/[.!?]$/.test(text)) { text += "."; tips.push("문장 끝에 마침표를 넣어 주세요."); }
    return { text: text, tips: tips };
  }

  function evaluate(answer, word) {
    var original = String(answer || "").trim();
    var term = String(word && word.term || "").trim();
    var example = String(word && word.example || "").trim();
    var correction = basicCorrections(original);
    var used = usesTerm(original, term) || Boolean(example && plain(original) === plain(example));
    var notes = [];
    if (!used) notes.push("이번 단어 ‘" + term + "’를 활용했는지 확인해 보세요.");
    if (plain(original).split(" ").filter(Boolean).length < 2) notes.push("한 단어에서 멈추지 말고 짧은 문장으로 써 보세요.");
    if (/[^\x00-\x7F]/.test(original.replace(/[’‘]/g, ""))) notes.push("영어로만 답안을 써 보세요.");
    correction.tips.slice(0, 2).forEach(function (tip) { notes.push(tip); });
    var sameAsExample = example && plain(original) === plain(example);
    return {
      tone: !used || notes.length > 2 ? "review" : correction.tips.length ? "polish" : "good",
      title: sameAsExample ? "예문과 잘 맞아요!" : !used ? "이번 단어를 다시 확인해요" : correction.tips.length ? "조금만 다듬어 볼까요?" : "단어를 잘 활용했어요!",
      notes: notes.slice(0, 3),
      suggestion: !used && example ? example : correction.text,
      suggestionLabel: !used && example ? "이렇게 써 보세요" : correction.text !== original ? "다듬은 문장" : "내 문장",
      changed: correction.text !== original,
      usedTerm: used
    };
  }

  window.WordkitComposeFeedback = evaluate;
})();
