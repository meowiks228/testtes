(() => {
  'use strict';

  const data = window.LokilandData;
  const utils = window.LokilandUtils;
  const storageNamespace = location.pathname.replace(/\/[^/]*$/, '') || '/';
  const draftKey = `lokiland-quiz-draft-v1:${storageNamespace}`;
  const scrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const $ = selector => document.querySelector(selector);
  const state = {
    current: 0,
    participantName: '',
    answers: Array(data.characters.length).fill(null),
    allowSwap: false,
    completedSubmission: null,
    completedFileName: ''
  };
  let toastTimer;

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 2800);
  }

  function showOnly(sectionId) {
    ['intro', 'quiz', 'review', 'success'].forEach(id => {
      $(`#${id}`).classList.toggle('hidden', id !== sectionId);
    });
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  }

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        participantName: state.participantName,
        answers: state.answers,
        current: state.current
      }));
    } catch {
      // Черновик необязателен: тест продолжает работать без localStorage.
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* localStorage недоступен */ }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey));
      if (!draft || !Array.isArray(draft.answers) || draft.answers.length !== data.characters.length) return;
      const candidate = {
        format: data.format,
        version: data.version,
        submissionId: 'draft-00000000',
        participantName: draft.participantName,
        createdAt: new Date().toISOString(),
        answers: draft.answers
      };
      const selectedAnswers = draft.answers.filter(Boolean);
      const unique = new Set(selectedAnswers);
      const validPartial = selectedAnswers.length === unique.size && draft.answers.every((answer, index) => {
        return answer === null || data.names[data.characters[index].gender].includes(answer);
      });
      if (!validPartial || String(candidate.participantName || '').trim().length > 60) return;
      state.participantName = String(draft.participantName || '').trim();
      state.answers = draft.answers;
      state.current = Math.min(Math.max(Number(draft.current) || 0, 0), data.characters.length - 1);
      $('#participantName').value = state.participantName;
      if (state.participantName.length >= 2) {
        $('#nameHint').textContent = 'Найден сохранённый черновик. Нажмите «Начать тест», чтобы продолжить.';
      }
    } catch {
      clearDraft();
    }
  }

  function renderQuestion() {
    const character = data.characters[state.current];
    const availableNames = data.names[character.gender];
    const used = new Set(state.answers.filter(Boolean));
    const answered = state.answers.filter(Boolean).length;
    const percent = Math.round((answered / data.characters.length) * 100);

    $('#progressLabel').textContent = `ПЕРСОНАЖ ${String(character.id).padStart(2, '0')} / ${data.characters.length}`;
    $('#progressPercent').textContent = `${percent}%`;
    $('#progressBar').style.width = `${percent}%`;
    $('.progress-track').setAttribute('aria-valuenow', String(answered));

    $('#characterCard').innerHTML = `
      <div class="card-index" aria-hidden="true">${String(character.id).padStart(2, '0')}</div>
      <div class="character-meta">
        <span>${character.country}</span>
        <span>${character.gender === 'male' ? 'МУЖЧИНА' : 'ЖЕНЩИНА'}</span>
      </div>
      <h2>${character.role}</h2>
      <p class="character-description">${character.text}</p>
      <div class="choice-title"><span>ВЫБЕРИТЕ ИМЯ</span></div>
      <div class="names-grid" role="radiogroup" aria-label="Имена для персонажа ${character.id}">
        ${availableNames.map((name, index) => {
          const selected = state.answers[state.current] === name;
          const unavailable = used.has(name) && !selected && !state.allowSwap;
          return `
            <button class="name-option${selected ? ' selected' : ''}${unavailable ? ' used' : ''}"
              type="button" aria-pressed="${selected}" data-name="${name}" ${unavailable ? 'disabled' : ''}>
              <span class="radio" aria-hidden="true"></span>
              <b>${name}</b>
              <small>${unavailable ? 'УЖЕ ВЫБРАНО' : `КАНДИДАТ ${String(index + 1).padStart(2, '0')}`}</small>
            </button>`;
        }).join('')}
      </div>`;

    document.querySelectorAll('.name-option:not(:disabled)').forEach(button => {
      button.addEventListener('click', () => {
        const nextName = button.dataset.name;
        if (state.allowSwap && used.has(nextName) && state.answers[state.current] !== nextName) {
          const otherIndex = state.answers.findIndex((answer, index) => index !== state.current && answer === nextName);
          if (otherIndex >= 0) state.answers[otherIndex] = state.answers[state.current];
        }
        state.answers[state.current] = nextName;
        saveDraft();
        renderQuestion();
        document.querySelector(`[data-name="${CSS.escape(nextName)}"]`)?.focus();
      });
    });

    $('#prevButton').disabled = state.current === 0;
    $('#nextButton').disabled = !state.answers[state.current];
    $('#nextButton').textContent = state.current === data.characters.length - 1 ? 'ПРОВЕРИТЬ →' : 'ДАЛЕЕ →';
    $('#selectionState').textContent = state.answers[state.current] ? `ВЫБРАНО: ${state.answers[state.current]}` : 'ВЫБЕРИТЕ ИМЯ';
  }

  function renderReview() {
    $('#reviewGrid').innerHTML = data.characters.map((character, index) => `
      <button class="review-item" type="button" data-index="${index}" aria-label="Изменить ответ для персонажа ${character.id}">
        <span>${String(character.id).padStart(2, '0')}</span>
        <p><small>${character.role.toUpperCase()}</small><b>${state.answers[index]}</b></p>
        <i>ИЗМЕНИТЬ ›</i>
      </button>`).join('');
    document.querySelectorAll('.review-item').forEach(button => {
      button.addEventListener('click', () => {
        state.current = Number(button.dataset.index);
        state.allowSwap = true;
        renderQuestion();
        showOnly('quiz');
      });
    });
  }

  function downloadText(contents, fileName, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadSubmission() {
    if (!state.completedSubmission) return;
    const csv = utils.encodeCsv(utils.submissionRows(state.completedSubmission, data.characters));
    downloadText(csv, state.completedFileName, 'text/csv;charset=utf-8');
  }

  $('#startForm').addEventListener('submit', event => {
    event.preventDefault();
    const participantName = $('#participantName').value.trim();
    if (participantName.length < 2) {
      toast('Введите имя или псевдоним — минимум 2 символа.');
      $('#participantName').focus();
      return;
    }
    state.participantName = participantName;
    saveDraft();
    renderQuestion();
    showOnly('quiz');
  });

  $('#prevButton').addEventListener('click', () => {
    if (state.current === 0) return;
    state.current -= 1;
    saveDraft();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  });

  $('#nextButton').addEventListener('click', () => {
    if (!state.answers[state.current]) return;
    if (state.current < data.characters.length - 1) {
      state.current += 1;
      saveDraft();
      renderQuestion();
      window.scrollTo({ top: 0, behavior: scrollBehavior });
      return;
    }
    if (state.answers.some(answer => !answer)) {
      toast('Ответьте на все 14 вопросов.');
      return;
    }
    state.allowSwap = false;
    renderReview();
    showOnly('review');
  });

  $('#backToQuizButton').addEventListener('click', () => {
    state.current = data.characters.length - 1;
    state.allowSwap = true;
    renderQuestion();
    showOnly('quiz');
  });

  $('#finishButton').addEventListener('click', () => {
    const submission = utils.createSubmission(state.participantName, state.answers);
    const validationError = utils.validateSubmission(submission, data);
    if (validationError) {
      toast(validationError);
      return;
    }
    state.completedSubmission = submission;
    const datePart = submission.createdAt.slice(0, 10);
    state.completedFileName = `lokiland-${utils.safeFilePart(state.participantName)}-${datePart}-${submission.submissionId.slice(0, 8)}.csv`;
    $('#fileName').textContent = state.completedFileName;
    clearDraft();
    showOnly('success');
    downloadSubmission();
  });

  $('#downloadAgainButton').addEventListener('click', downloadSubmission);
  $('#restartButton').addEventListener('click', () => {
    clearDraft();
    window.location.reload();
  });

  restoreDraft();
})();
