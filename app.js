(() => {
  'use strict';

  const topics = {
    concepts: window.CONCEPTS_DATA,
    networks: window.STUDY_DATA
  };
  const activeTopicId = localStorage.getItem('studyg-active-topic') in topics
    ? localStorage.getItem('studyg-active-topic')
    : 'concepts';
  const data = topics[activeTopicId];
  if (!data || !topics.concepts || !topics.networks) {
    document.body.innerHTML = '<p style="padding:2rem">Study data could not be loaded.</p>';
    return;
  }

  const presentation = activeTopicId === 'networks'
    ? {
        topicNumber: 2,
        chapter: 'Topic 2',
        title: 'Computer Networks I',
        heroMain: 'Computer',
        heroAccent: 'Networks I',
        lede: 'Definitions, comparisons, transmission media, network devices, cloud computing, and IoT from the second presentation.',
        coverage: 'Computer network basics, LAN and WAN, P2P and client/server networks, transmission media, hardware, cloud computing, and IoT.',
        sourcePdf: 'assets/source-deck.pdf',
        coreTopics: ['Computer networks and communication channels', 'LAN, WAN, P2P, and client/server networks', 'Wired and wireless transmission media', 'NIC, switch, bridge, router, gateway, and access point', 'Cloud computing and Internet of Things']
      }
    : data.meta;

  const storageKey = activeTopicId === 'networks' ? 'networks-i-study-state-v1' : 'concepts-study-state-v1';
  const defaultState = {
    known: [],
    review: [],
    bookmarks: [],
    mistakes: [],
    mcqAttempts: 0,
    mcqCorrect: 0,
    lastView: 'overview'
  };

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch {
    saved = {};
  }
  const state = { ...defaultState, ...saved };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const moduleName = (id) => data.modules.find((module) => module.id === id)?.label ?? 'All modules';
  const comparableText = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const motion = window.StudyMotion;

  function switchTopic(topicId) {
    if (!topics[topicId] || topicId === activeTopicId) return;
    localStorage.setItem('studyg-active-topic', topicId);
    location.reload();
  }

  function initializeTopicUI() {
    const number = String(presentation.topicNumber).padStart(2, '0');
    document.title = `${presentation.title} — StudyGG`;
    $('#topic-select').value = activeTopicId;
    $('#topic-select').addEventListener('change', (event) => switchTopic(event.target.value));
    $$('[data-topic-choice]').forEach((button) => {
      const isActive = button.dataset.topicChoice === activeTopicId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-current', isActive ? 'true' : 'false');
      button.addEventListener('click', () => switchTopic(button.dataset.topicChoice));
    });
    $('#brand-mark').textContent = number;
    $('#brand-topic').textContent = `${presentation.chapter} / ${presentation.title}`;
    $('#hero-topic-number').textContent = number;
    $('#hero-vertical-label').textContent = `${presentation.title.toUpperCase()} / TOPIC ${presentation.topicNumber}`;
    $('#hero-eyebrow').textContent = `${presentation.chapter} / study materials`;
    $('#hero-title-main').textContent = presentation.heroMain;
    $('#hero-title-accent').textContent = presentation.heroAccent;
    $('#hero-lede').textContent = presentation.lede;
    $('#source-coverage').textContent = presentation.coverage;
    $('#source-deck-link').href = presentation.sourcePdf;
    $('#source-deck-link').textContent = `Open Topic ${presentation.topicNumber} source PDF ↗`;
    $('#dashboard-description').textContent = `Includes all ${data.meta.slideCount} source slides, curated questions, multiple-choice practice, and a source-slide reference for every answer.`;
    $('#core-topics').innerHTML = presentation.coreTopics.map((topic) => `<li>${topic}</li>`).join('');
    $('#notes-description').textContent = `Search all ${data.meta.slideCount} slides. Open a page to read its exact wording beside the original slide image.`;
    $('#atlas-description').textContent = `All ${data.meta.slideCount} pages rendered from the PDF export, including diagrams and visual examples.`;
    $('#footer-topic').textContent = `${presentation.chapter} / ${presentation.title}`;
    $('#footer-counts').textContent = `${data.meta.slideCount} source slides · five sections`;
    $('#notes-search').placeholder = activeTopicId === 'concepts' ? 'e.g. RAM, printer, virus' : 'e.g. router, LAN, cloud';
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    updateGlobalProgress();
  }

  let toastTimer;
  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 1800);
  }

  function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function toggleInList(listName, value, force) {
    const set = new Set(state[listName]);
    const shouldAdd = force ?? !set.has(value);
    if (shouldAdd) set.add(value);
    else set.delete(value);
    state[listName] = [...set];
    saveState();
    return shouldAdd;
  }

  function fillModuleSelect(select, includeAll = true) {
    select.innerHTML = '';
    if (includeAll) select.add(new Option('All modules', 'all'));
    data.modules.forEach((module) => select.add(new Option(`${module.mark}. ${module.label}`, module.id)));
  }

  function setView(viewName, updateHash = true) {
    const target = $(`[data-view="${viewName}"]`);
    if (!target) return;
    $$('.view').forEach((view) => {
      const active = view === target;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    $$('[data-view-link]').forEach((link) => {
      const active = link.dataset.viewLink === viewName;
      if (link.matches('.main-nav button')) link.setAttribute('aria-selected', String(active));
    });
    state.lastView = viewName;
    saveState();
    if (updateHash) history.replaceState(null, '', `#${viewName}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewName === 'notes') renderNotes();
    if (viewName === 'atlas') renderAtlas();
    requestAnimationFrame(() => motion?.enterView(viewName, target));
  }

  $$('[data-view-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setView(link.dataset.viewLink);
    });
  });

  function updateGlobalProgress() {
    const reviewed = new Set([...state.known, ...state.review]).size;
    const percent = Math.min(100, Math.round((reviewed / data.meta.qaCount) * 100));
    $('#header-progress-label').textContent = `${reviewed} reviewed`;
    $('#header-progress-bar').style.transform = `scaleX(${percent / 100})`;
    $('#stat-known').textContent = state.known.length;
  }

  function renderOverview() {
    $('#stat-slides').textContent = data.meta.slideCount;
    $('#stat-qa').textContent = data.meta.qaCount;
    $('#stat-mcq').textContent = data.meta.mcqCount;
    const ledger = $('#module-ledger');
    ledger.innerHTML = '';
    data.modules.forEach((module) => {
      const questions = data.qa.filter((item) => item.moduleId === module.id).length;
      const row = document.createElement('article');
      row.className = 'module-row';
      row.innerHTML = `
        <span class="module-mark">${module.mark}</span>
        <h3>${module.label}</h3>
        <p>${module.note} <strong>${questions} recall prompts.</strong></p>
        <button type="button">Open questions →</button>`;
      $('button', row).addEventListener('click', () => {
        $('#recall-module').value = module.id;
        rebuildRecallDeck();
        setView('recall');
      });
      ledger.append(row);
    });

    const leastKnown = data.modules
      .map((module) => {
        const ids = data.qa.filter((item) => item.moduleId === module.id).map((item) => item.id);
        const known = ids.filter((id) => state.known.includes(id)).length;
        return { module, ratio: ids.length ? known / ids.length : 0 };
      })
      .sort((a, b) => a.ratio - b.ratio)[0];
    $('#next-study-title').textContent = `Continue with ${leastKnown.module.label}`;
    $('#next-study-copy').textContent = leastKnown.module.note;
    updateGlobalProgress();
  }

  const notes = {
    module: 'all',
    search: '',
    bookmarksOnly: false
  };

  function initializeNotes() {
    const filters = $('#notes-module-filters');
    const options = [{ id: 'all', label: 'All slides' }, ...data.modules.map((module) => ({ id: module.id, label: module.label }))];
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.classList.toggle('is-active', option.id === 'all');
      button.addEventListener('click', () => {
        notes.module = option.id;
        $$('.filter-stack button', filters).forEach((item) => item.classList.toggle('is-active', item === button));
        renderNotes();
      });
      filters.append(button);
    });
    $('#notes-search').addEventListener('input', (event) => {
      notes.search = event.target.value.trim().toLowerCase();
      renderNotes();
    });
    $('#bookmarks-only').addEventListener('change', (event) => {
      notes.bookmarksOnly = event.target.checked;
      renderNotes();
    });
  }

  function slideMatches(slide) {
    if (notes.module !== 'all' && slide.moduleId !== notes.module) return false;
    if (notes.bookmarksOnly && !state.bookmarks.includes(slide.number)) return false;
    if (!notes.search) return true;
    return `${slide.title} ${slide.body.join(' ')}`.toLowerCase().includes(notes.search);
  }

  function renderNotes() {
    const filtered = data.slides.filter(slideMatches);
    $('#notes-result-count').textContent = `${filtered.length} of ${data.meta.slideCount} slides`;
    const list = $('#notes-list');
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<article class="slide-note"><div class="slide-note-body"><div><h2>No slides found.</h2><p>Clear the search or switch the module filter.</p></div></div></article>';
      return;
    }

    filtered.forEach((slide) => {
      const details = document.createElement('details');
      details.className = 'slide-note';
      const lineLabel = slide.body.length ? `${slide.body.length} exact source line${slide.body.length === 1 ? '' : 's'}` : 'visual / title slide';
      details.innerHTML = `
        <summary>
          <span class="slide-number">${String(slide.number).padStart(3, '0')}</span>
          <span class="slide-summary-title"><strong>${slide.title}</strong><small>${moduleName(slide.moduleId)} · ${lineLabel}</small></span>
        </summary>
        <div class="slide-note-body">
          <button type="button" class="slide-image-button" aria-label="Open source slide ${slide.number}">
            <img src="${slide.image}" alt="Source slide ${slide.number}: ${slide.title}" loading="lazy" />
          </button>
          <div>
            ${slide.body.length ? `<ol class="exact-lines">${slide.body.map((line) => `<li>${line}</li>`).join('')}</ol>` : '<p>This is a visual or section-divider slide. Open the image to inspect it.</p>'}
            <div class="note-actions">
              <button type="button" class="bookmark-button" aria-pressed="${state.bookmarks.includes(slide.number)}">${state.bookmarks.includes(slide.number) ? 'Bookmarked' : 'Bookmark slide'}</button>
              <button type="button" class="text-button">Open large view ↗</button>
            </div>
          </div>
        </div>`;
      const buttons = $$('button', details);
      buttons[0].addEventListener('click', () => openSlide(slide.number));
      buttons[1].addEventListener('click', () => {
        const added = toggleInList('bookmarks', slide.number);
        buttons[1].setAttribute('aria-pressed', String(added));
        buttons[1].textContent = added ? 'Bookmarked' : 'Bookmark slide';
        toast(added ? `Slide ${slide.number} bookmarked.` : `Slide ${slide.number} removed from bookmarks.`);
        if (notes.bookmarksOnly && !added) renderNotes();
      });
      buttons[2].addEventListener('click', () => openSlide(slide.number));
      details.addEventListener('toggle', () => motion?.detailsOpen(details));
      list.append(details);
    });
    motion?.listIn($$('.slide-note', list));
  }

  let recallDeck = [];
  let recallIndex = 0;
  let recallRevealed = false;

  function initializeRecall() {
    fillModuleSelect($('#recall-module'));
    $('#recall-module').addEventListener('change', rebuildRecallDeck);
    $('#recall-review-only').addEventListener('change', rebuildRecallDeck);
    $('#recall-shuffle').addEventListener('click', () => {
      recallDeck = shuffled(recallDeck);
      recallIndex = 0;
      renderRecallCard();
      toast('Question deck shuffled.');
    });
    $('#recall-prev').addEventListener('click', () => moveRecall(-1));
    $('#recall-next').addEventListener('click', () => moveRecall(1));
    $('#recall-reveal').addEventListener('click', revealRecall);
    $('#recall-known').addEventListener('click', () => gradeRecall('known'));
    $('#recall-review').addEventListener('click', () => gradeRecall('review'));
    $('#recall-open-slide').addEventListener('click', () => openSlide(currentRecall().slide));
    $('#recall-bookmark').addEventListener('click', () => {
      const item = currentRecall();
      const added = toggleInList('bookmarks', item.slide);
      $('#recall-bookmark').setAttribute('aria-pressed', String(added));
      $('#recall-bookmark').textContent = added ? 'Bookmarked' : 'Bookmark slide';
      toast(added ? `Slide ${item.slide} bookmarked.` : `Slide ${item.slide} removed from bookmarks.`);
    });
    rebuildRecallDeck();
  }

  function rebuildRecallDeck() {
    const moduleId = $('#recall-module').value || 'all';
    const reviewOnly = $('#recall-review-only').checked;
    recallDeck = data.qa.filter((item) => moduleId === 'all' || item.moduleId === moduleId);
    if (reviewOnly) recallDeck = recallDeck.filter((item) => state.review.includes(item.id));
    if (!recallDeck.length && reviewOnly) {
      $('#recall-review-only').checked = false;
      recallDeck = data.qa.filter((item) => moduleId === 'all' || item.moduleId === moduleId);
      toast('Your review pile is empty, so the full module is shown.');
    }
    recallIndex = 0;
    renderRecallCard();
  }

  function currentRecall() {
    return recallDeck[recallIndex] ?? data.qa[0];
  }

  function renderRecallCard() {
    const item = currentRecall();
    recallRevealed = false;
    $('#recall-answer').hidden = true;
    $('#recall-reveal').hidden = false;
    $('#recall-draft').value = '';
    $('#recall-position').textContent = `${recallIndex + 1} / ${recallDeck.length}`;
    $('#recall-module-label').textContent = moduleName(item.moduleId);
    $('#recall-source').textContent = `${moduleName(item.moduleId)} / slide ${item.slide}`;
    $('#recall-prompt').textContent = item.prompt;
    $('#recall-answer-text').textContent = item.answer;
    $('#recall-source-text').textContent = item.sourceLine;
    $('#recall-evidence').hidden = comparableText(item.answer) === comparableText(item.sourceLine);
    $('#recall-known-count').textContent = state.known.length;
    $('#recall-review-count').textContent = state.review.length;
    const bookmarked = state.bookmarks.includes(item.slide);
    $('#recall-bookmark').setAttribute('aria-pressed', String(bookmarked));
    $('#recall-bookmark').textContent = bookmarked ? 'Bookmarked' : 'Bookmark slide';
    motion?.swapCard('#recall-card');
  }

  function revealRecall() {
    recallRevealed = true;
    $('#recall-answer').hidden = false;
    $('#recall-reveal').hidden = true;
    motion?.reveal('#recall-answer');
    $('#recall-known').focus();
  }

  function moveRecall(direction) {
    recallIndex = (recallIndex + direction + recallDeck.length) % recallDeck.length;
    renderRecallCard();
  }

  function gradeRecall(result) {
    const item = currentRecall();
    if (result === 'known') {
      toggleInList('known', item.id, true);
      toggleInList('review', item.id, false);
      toast('Marked known.');
    } else {
      toggleInList('review', item.id, true);
      toggleInList('known', item.id, false);
      toast('Added to your review pile.');
    }
    moveRecall(1);
  }

  let quiz = [];
  let quizIndex = 0;
  let quizCorrect = 0;
  let quizAnswered = false;

  function initializeQuiz() {
    fillModuleSelect($('#mcq-module'));
    $('#quiz-start').addEventListener('click', startQuiz);
    $('#quiz-next').addEventListener('click', nextQuizQuestion);
    $('#quiz-open-slide').addEventListener('click', () => openSlide(quiz[quizIndex].slide));
    $('#quiz-again').addEventListener('click', resetQuiz);
    $('#quiz-mistakes').addEventListener('click', () => {
      $('#mcq-length').value = 'mistakes';
      resetQuiz();
      startQuiz();
    });
  }

  function startQuiz() {
    const moduleId = $('#mcq-module').value;
    const length = $('#mcq-length').value;
    let pool = data.mcq.filter((item) => moduleId === 'all' || item.moduleId === moduleId);
    if (length === 'mistakes') pool = pool.filter((item) => state.mistakes.includes(item.id));
    if (!pool.length) {
      toast(length === 'mistakes' ? 'No saved mistakes in this module yet.' : 'No questions found for this filter.');
      return;
    }
    const count = length === 'all' || length === 'mistakes' ? pool.length : Math.min(Number(length), pool.length);
    quiz = shuffled(pool).slice(0, count);
    quizIndex = 0;
    quizCorrect = 0;
    $('#quiz-setup').hidden = true;
    $('#quiz-result').hidden = true;
    $('#quiz-stage').hidden = false;
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const item = quiz[quizIndex];
    quizAnswered = false;
    $('#quiz-feedback').hidden = true;
    $('#quiz-progress-label').textContent = `Question ${quizIndex + 1} / ${quiz.length}`;
    $('#quiz-score').textContent = `Score ${quizCorrect}`;
    $('#quiz-progress-bar').style.transform = `scaleX(${quizIndex / quiz.length})`;
    $('#quiz-topic').textContent = `${moduleName(item.moduleId)} / slide ${item.slide}`;
    $('#quiz-prompt').textContent = item.prompt;
    const list = $('#quiz-options');
    list.innerHTML = '';
    item.options.forEach((option, optionIndex) => {
      const button = document.createElement('button');
      button.className = 'option-button';
      button.type = 'button';
      button.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${option}</span>`;
      button.addEventListener('click', () => answerQuiz(optionIndex));
      list.append(button);
    });
    motion?.swapCard('.quiz-card');
    motion?.listIn($$('.option-button', list));
  }

  function answerQuiz(selectedIndex) {
    if (quizAnswered) return;
    quizAnswered = true;
    const item = quiz[quizIndex];
    const correct = selectedIndex === item.correctIndex;
    const buttons = $$('.option-button', $('#quiz-options'));
    buttons.forEach((button, index) => {
      button.disabled = true;
      if (index === item.correctIndex) button.classList.add('is-correct');
      if (index === selectedIndex && !correct) button.classList.add('is-wrong');
    });
    state.mcqAttempts += 1;
    if (correct) {
      quizCorrect += 1;
      state.mcqCorrect += 1;
      toggleInList('mistakes', item.id, false);
      $('#quiz-feedback-label').textContent = 'Correct.';
    } else {
      toggleInList('mistakes', item.id, true);
      $('#quiz-feedback-label').textContent = 'Incorrect. Correct answer:';
    }
    saveState();
    $('#quiz-exact-answer').textContent = item.answer;
    const showSource = comparableText(item.answer) !== comparableText(item.sourceLine);
    $('#quiz-source-line').hidden = !showSource;
    $('#quiz-source-line').textContent = showSource ? `Supporting PPT line: ${item.sourceLine}` : '';
    $('#quiz-feedback').hidden = false;
    motion?.reveal('#quiz-feedback');
    $('#quiz-score').textContent = `Score ${quizCorrect}`;
    $('#quiz-next').textContent = quizIndex === quiz.length - 1 ? 'Finish session' : 'Next question';
    $('#quiz-next').focus();
  }

  function nextQuizQuestion() {
    if (quizIndex === quiz.length - 1) {
      finishQuiz();
      return;
    }
    quizIndex += 1;
    renderQuizQuestion();
  }

  function finishQuiz() {
    $('#quiz-stage').hidden = true;
    $('#quiz-result').hidden = false;
    const percent = Math.round((quizCorrect / quiz.length) * 100);
    $('#quiz-result-score').textContent = `${quizCorrect} / ${quiz.length}`;
    $('#quiz-result-copy').textContent = `${percent}%. ${state.mistakes.length} incorrect answer${state.mistakes.length === 1 ? '' : 's'} saved for review.`;
    motion?.reveal('#quiz-result');
  }

  function resetQuiz() {
    $('#quiz-stage').hidden = true;
    $('#quiz-result').hidden = true;
    $('#quiz-setup').hidden = false;
  }

  let atlasModule = 'all';
  let atlasRendered = false;

  function initializeAtlas() {
    const toolbar = $('#atlas-filters');
    const filters = [{ id: 'all', label: `All ${data.meta.slideCount} slides` }, ...data.modules.map((module) => ({ id: module.id, label: module.label }))];
    filters.forEach((filter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = filter.label;
      button.classList.toggle('is-active', filter.id === 'all');
      button.addEventListener('click', () => {
        atlasModule = filter.id;
        $$('.atlas-toolbar button').forEach((item) => item.classList.toggle('is-active', item === button));
        renderAtlas(true);
      });
      toolbar.append(button);
    });
  }

  function renderAtlas(force = false) {
    if (atlasRendered && !force) return;
    atlasRendered = true;
    const slides = data.slides.filter((slide) => atlasModule === 'all' || slide.moduleId === atlasModule);
    const grid = $('#atlas-grid');
    grid.innerHTML = '';
    slides.forEach((slide) => {
      const figure = document.createElement('figure');
      figure.className = 'atlas-item';
      figure.innerHTML = `
        <button type="button" aria-label="Open source slide ${slide.number}"><img src="${slide.image}" alt="Slide ${slide.number}: ${slide.title}" loading="lazy" /></button>
        <figcaption><strong>${String(slide.number).padStart(3, '0')} / ${slide.title}</strong>${moduleName(slide.moduleId)}</figcaption>`;
      $('button', figure).addEventListener('click', () => openSlide(slide.number));
      grid.append(figure);
    });
    motion?.listIn($$('.atlas-item', grid));
  }

  function openSlide(number) {
    const slide = data.slides.find((item) => item.number === number);
    if (!slide) return;
    $('#dialog-slide-number').textContent = `${moduleName(slide.moduleId)} / source slide ${slide.number}`;
    $('#dialog-slide-title').textContent = slide.title;
    $('#dialog-slide-image').src = slide.image;
    $('#dialog-slide-image').alt = `Source slide ${slide.number}: ${slide.title}`;
    const text = $('#dialog-slide-text');
    text.innerHTML = slide.body.length
      ? slide.body.map((line) => `<p>${line}</p>`).join('')
      : '<p>Visual or section-divider slide.</p>';
    $('#slide-dialog').showModal();
  }

  $('#dialog-close').addEventListener('click', () => $('#slide-dialog').close());
  $('#slide-dialog').addEventListener('click', (event) => {
    if (event.target === $('#slide-dialog')) $('#slide-dialog').close();
  });

  document.addEventListener('keydown', (event) => {
    const recallVisible = !$('#view-recall').hidden;
    if (!recallVisible || event.target.matches('textarea, input, select')) return;
    if (event.key === 'ArrowRight') moveRecall(1);
    if (event.key === 'ArrowLeft') moveRecall(-1);
    if (event.key === ' ' && !recallRevealed) {
      event.preventDefault();
      revealRecall();
    }
  });

  initializeTopicUI();
  renderOverview();
  initializeNotes();
  initializeRecall();
  initializeQuiz();
  initializeAtlas();
  const initialView = location.hash.slice(1) || state.lastView || 'overview';
  setView(['overview', 'notes', 'recall', 'mcq', 'atlas'].includes(initialView) ? initialView : 'overview', false);
  motion?.init();
})();
