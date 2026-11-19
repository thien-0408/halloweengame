// Progress belongs to this page and this browser. DOM references are rebuilt after reload.
(function () {
  const key = 'halloween-progress-v2:' + location.pathname;
  const oldKey = 'halloween-progress-v1:' + location.pathname;
  const hasCauldron = typeof SENTENCES !== 'undefined';
  let restoring = true;
  const $ = id => document.getElementById(id);
  const nodes = selector => Array.from(document.querySelectorAll(selector));
  const snapshot = el => ({ html: el.innerHTML, className: el.className });

  function save() {
    if (restoring) return;
    try {
      const state = { version: 2, tab: activeTab, score, streak,
        filter: typeof currentUnitFilter === 'undefined' ? null : currentUnitFilter };
      if (activeTab === 'matching') {
        state.match = { pairs: matchPairs, round: matchRound, count: matchMatchedCount,
          queue: typeof matchQueue === 'undefined' ? null : matchQueue,
          left: nodes('#matchColLeft .match-item').map(el => ({ id: el.dataset.id, ...snapshot(el) })),
          right: nodes('#matchColRight .match-item').map(el => ({ id: el.dataset.id, ...snapshot(el) })) };
      } else if (activeTab === 'memory') {
        state.memory = { count: memFlipsCount, pairs: memMatchedPairs,
          cards: nodes('#memoryBoard .memory-card').map(el => ({ data: JSON.parse(el.dataset.card), ...snapshot(el) })) };
      } else if (activeTab === 'spelling') {
        state.spelling = { list: spellList, index: spellIdx,
          tiles: spellLetterTiles.map(t => t.char),
          slots: spellSlots.map(s => ({ char: s.char, tileIdx: s.tileIdx, className: s.el.className })) };
      } else if (activeTab === 'quiz' || (hasCauldron && activeTab === 'cauldron')) {
        const quiz = activeTab === 'quiz', prefix = quiz ? 'quiz' : 'caul';
        state.exercise = { list: quiz ? quizQuestions : caulList, index: quiz ? quizIdx : caulIdx,
          answered: quiz ? quizAnswered : caulAnswered, lives: quiz ? quizLives : null };
        if (state.exercise.answered && state.exercise.index < state.exercise.list.length) {
          state.exercise.options = $(prefix + 'Opts').innerHTML;
          state.exercise.feedback = $(prefix + 'Feedback').outerHTML;
          if (!quiz) { state.exercise.tip = $('caulTip').outerHTML; state.exercise.sentence = $('caulEn').innerHTML; }
        }
      }
      const modal = $('resultModal');
      if (modal.classList.contains('show')) state.modal = {
        icon: $('modalIcon').textContent, title: $('modalTitle').textContent,
        scoreText: $('modalScore').textContent, msg: $('modalMsg').textContent };
      localStorage.setItem(key, JSON.stringify(state));
    } catch (_) { /* Storage may be disabled or full. */ }
  }

  function restoreMatch(m) {
    matchPairs = m.pairs; matchRound = m.round; matchMatchedCount = m.count;
    if (typeof matchQueue !== 'undefined' && Array.isArray(m.queue)) matchQueue = m.queue;
    matchLeftSelected = null; matchRightSelected = null;
    $('matchRoundTxt').textContent = `Vòng ${matchRound} · Ghép ${matchPairs.length} cặp từ`;
    $('matchHintTxt').textContent = `Đã nối: ${matchMatchedCount}/${matchPairs.length}`;
    for (const [side, cards] of [['Left', m.left], ['Right', m.right]]) {
      const col = $('matchCol' + side); col.innerHTML = '';
      for (const card of cards) {
        const item = matchPairs.find(v => String(v.id) === String(card.id));
        if (!item) throw new Error('Invalid matching item');
        const el = document.createElement('div'); el.className = card.className; el.dataset.id = card.id; el.innerHTML = card.html;
        // A wrong pair was awaiting its animation; return both to the unselected state.
        if (el.classList.contains('error')) el.classList.remove('error', 'selected');
        const button = el.querySelector('.speak-btn');
        if (button) button.onclick = e => { e.stopPropagation(); if (typeof speakVocab === 'function') speakVocab(item); else speak(item.word); };
        el.onclick = () => side === 'Left' ? selectMatchLeft(el, item) : selectMatchRight(el, item);
        col.appendChild(el);
        if (el.classList.contains('selected')) {
          if (side === 'Left') matchLeftSelected = { el, item }; else matchRightSelected = { el, item };
        }
      }
    }
  }
  function restoreMemory(m) {
    const board = $('memoryBoard'); board.innerHTML = ''; memFlipped = [];
    memFlipsCount = m.count; memMatchedPairs = m.pairs;
    $('memFlips').textContent = memFlipsCount; $('memPairs').textContent = `${memMatchedPairs}/6`;
    const pending = m.cards.filter(c => c.className.includes('flipped') && !c.className.includes('matched')).length;
    m.cards.forEach((card, idx) => {
      const el = document.createElement('div'); el.className = card.className; el.dataset.card = JSON.stringify(card.data); el.innerHTML = card.html;
      if (pending > 1 && !el.classList.contains('matched')) { el.classList.remove('flipped'); el.innerHTML = '<div class="card-back">🎃</div>'; }
      el.onclick = () => flipMemoryCard(el, card.data, idx); board.appendChild(el);
      if (el.classList.contains('flipped') && !el.classList.contains('matched')) memFlipped.push({ cardEl: el, cardData: card.data, idx });
    });
  }
  function restoreSpelling(s) {
    spellList = s.list; spellIdx = s.index;
    if (!spellList.length) return;
    // A completed word has already awarded points; continue to the next word.
    const completed = s.slots.length && s.slots.every(slot => slot.className.split(' ').includes('ok'));
    if (completed) {
      spellIdx++;
      if (spellIdx >= spellList.length && hasCauldron) {
        showModal({ icon: '🧩', title: 'Bậc thầy Ghép Chữ!', scoreText: 'Hoàn thành!',
          msg: 'Em đã hoàn thành tất cả các từ!', onPlayAgain: initSpelling });
        return;
      }
      loadSpellWord(); return;
    }
    loadSpellWord();
    const container = $('spellLetters'); container.innerHTML = ''; spellLetterTiles = [];
    s.tiles.forEach((char, i) => {
      const el = document.createElement('button'); el.className = 'spell-tile'; el.textContent = char.toUpperCase();
      el.onclick = () => placeSpellLetter(char, i, el); container.appendChild(el);
      spellLetterTiles.push({ el, char, used: false });
    });
    s.slots.forEach((saved, i) => {
      const slot = spellSlots[i]; if (!slot || saved.char === null) return;
      slot.char = saved.char; slot.tileIdx = saved.tileIdx; slot.el.textContent = saved.char.toUpperCase();
      slot.el.classList.add('filled');
      const tile = spellLetterTiles[saved.tileIdx]; if (tile) { tile.used = true; tile.el.classList.add('used'); }
    });
  }
  function restoreExercise(ex, tab) {
    const quiz = tab === 'quiz', prefix = quiz ? 'quiz' : 'caul';
    if (quiz) { quizQuestions = ex.list; quizIdx = ex.index; quizLives = ex.lives; drawQuizLives(); loadQuizQuestion(); quizAnswered = !!ex.answered; }
    else { caulList = ex.list; caulIdx = ex.index; loadCauldron(); caulAnswered = !!ex.answered; }
    if (ex.answered && ex.index < ex.list.length) {
      $(prefix + 'Opts').innerHTML = ex.options;
      $(prefix + 'Feedback').outerHTML = ex.feedback;
      if (!quiz) { $('caulTip').outerHTML = ex.tip; $('caulEn').innerHTML = ex.sentence; }
      if (!quiz || quizLives > 0) $(prefix + 'NextBtn').classList.remove('hide');
    }
  }
  try {
    let saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved) {
      const old = JSON.parse(localStorage.getItem(oldKey) || 'null');
      if (old && Array.isArray(old.list)) saved = { tab: old.tab, score: old.score, streak: old.streak, exercise: old };
    }
    if (saved && document.querySelector(`.tab-btn[data-tab="${saved.tab}"]`)) {
      if (saved.filter !== null && typeof currentUnitFilter !== 'undefined') {
        currentUnitFilter = saved.filter;
        nodes('.chip').forEach(el => el.classList.toggle('active', el.dataset.unit === currentUnitFilter));
      }
      document.querySelector(`.tab-btn[data-tab="${saved.tab}"]`).click();
      score = Number(saved.score) || 0; streak = Number(saved.streak) || 0;
      $('scoreVal').textContent = score.toLocaleString(); $('streakVal').textContent = streak;
      if (saved.tab === 'matching' && saved.match) restoreMatch(saved.match);
      else if (saved.tab === 'memory' && saved.memory) restoreMemory(saved.memory);
      else if (saved.tab === 'spelling' && saved.spelling) restoreSpelling(saved.spelling);
      else if ((saved.tab === 'quiz' || (hasCauldron && saved.tab === 'cauldron')) && saved.exercise) restoreExercise(saved.exercise, saved.tab);
      if (saved.modal) {
        const replay = { matching: () => { matchRound++; initMatching(); }, memory: initMemory,
          spelling: initSpelling, quiz: initQuiz, cauldron: hasCauldron ? initCauldron : null }[saved.tab];
        showModal({ ...saved.modal, onPlayAgain: replay });
      } else if (saved.tab === 'matching' && matchPairs.length && matchMatchedCount >= matchPairs.length) {
        showModal({ title: 'Hoàn thành vòng nối từ!', msg: 'Em đã nối đúng tất cả các cặp!', onPlayAgain: () => { matchRound++; initMatching(); } });
      } else if (saved.tab === 'memory' && memMatchedPairs >= 6) {
        showModal({ title: 'Trí nhớ siêu phàm!', msg: 'Em đã tìm đủ các cặp thẻ!', onPlayAgain: initMemory });
      } else if (saved.tab === 'quiz' && saved.exercise && quizLives <= 0) {
        showModal({ icon: '👻', title: 'Hết bí ngô rồi!', scoreText: 'Thử sức lại nhé!', onPlayAgain: initQuiz });
      }
    }
  } catch (_) { /* Ignore invalid saved progress. */ }
  restoring = false;
  document.addEventListener('click', save);
  document.addEventListener('keyup', save);
  window.addEventListener('pagehide', save);
  // Delayed card flips, transitions and completion dialogs also change progress.
  let timer;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(save, 50); })
    .observe(document.querySelector('main') || document.body, { subtree: true, childList: true, attributes: true, characterData: true });
})();
