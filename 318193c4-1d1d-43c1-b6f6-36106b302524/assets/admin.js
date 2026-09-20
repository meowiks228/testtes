(() => {
  'use strict';

  const data = window.LokilandData;
  const utils = window.LokilandUtils;
  const storageNamespace = location.pathname.replace(/\/[^/]*$/, '') || '/';
  const storageKey = `lokiland-admin-archive-v1:${storageNamespace}`;
  const $ = selector => document.querySelector(selector);
  let submissions = loadArchive();
  let selectedId = submissions[0]?.submissionId || null;
  let toastTimer;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return 'Дата неизвестна';
    }
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
  }

  function loadArchive() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (!Array.isArray(stored)) return [];
      return stored.filter(item => !utils.validateSubmission(item, data)).map(item => ({
        ...item,
        adminLabel: String(item.adminLabel || '').slice(0, 80),
        importedAt: typeof item.importedAt === 'string' && !Number.isNaN(Date.parse(item.importedAt))
          ? new Date(item.importedAt).toISOString()
          : item.createdAt
      }));
    } catch {
      return [];
    }
  }

  function persistArchive(nextSubmissions) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextSubmissions));
      return true;
    } catch {
      toast('Не удалось сохранить данные браузера. Скачайте backup или освободите место.');
      return false;
    }
  }

  function saveArchive() {
    return persistArchive(submissions);
  }

  function sortedSubmissions() {
    return submissions.slice().sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  }

  function render() {
    const ordered = sortedSubmissions();
    const query = $('#searchInput').value.trim().toLocaleLowerCase('ru');
    const filtered = ordered.filter(item => `${item.participantName} ${item.adminLabel}`.toLocaleLowerCase('ru').includes(query));

    $('#totalCount').textContent = submissions.length;
    $('#lastImport').textContent = ordered[0] ? new Date(ordered[0].importedAt).toLocaleDateString('ru-RU') : '—';
    $('#filterCount').textContent = `ПОКАЗАНО: ${filtered.length}`;
    $('#submissionList').innerHTML = filtered.length ? filtered.map((item, index) => `
      <button class="submission-item${item.submissionId === selectedId ? ' active' : ''}" type="button" data-id="${escapeHtml(item.submissionId)}">
        <span class="file-number">#${String(filtered.length - index).padStart(3, '0')}</span>
        <span><b>${escapeHtml(item.adminLabel || item.participantName)}</b><small>${item.adminLabel ? `Участник: ${escapeHtml(item.participantName)}` : escapeHtml(formatDate(item.createdAt))}</small></span>
        <i>›</i>
      </button>`).join('') : '<div class="empty-list">По этому запросу анкет нет</div>';

    document.querySelectorAll('.submission-item').forEach(button => {
      button.addEventListener('click', () => {
        selectedId = button.dataset.id;
        render();
        renderDetail();
      });
    });

    if (selectedId && !submissions.some(item => item.submissionId === selectedId)) selectedId = null;
    renderDetail();
  }

  function renderDetail() {
    const selected = submissions.find(item => item.submissionId === selectedId);
    if (!selected) {
      $('#submissionDetail').innerHTML = `
        <div class="empty-state">
          <span class="empty-symbol">LL</span>
          <b>ВЫБЕРИТЕ АНКЕТУ</b>
          <p>или импортируйте таблицу участника</p>
        </div>`;
      return;
    }

    $('#submissionDetail').innerHTML = `
      <div class="detail-head">
        <div>
          <span class="eyebrow">ДОСЬЕ УЧАСТНИКА</span>
          <h2>${escapeHtml(selected.adminLabel || selected.participantName)}</h2>
          <p>${escapeHtml(formatDate(selected.createdAt))} · ID ${escapeHtml(selected.submissionId.slice(0, 12))}</p>
        </div>
        <button id="deleteButton" class="button danger" type="button">УДАЛИТЬ</button>
      </div>
      <div class="label-editor">
        <label for="adminLabelInput">ВАША МЕТКА / ИМЯ ДЛЯ ЭТОЙ АНКЕТЫ</label>
        <div class="label-editor-row">
          <input id="adminLabelInput" maxlength="80" value="${escapeHtml(selected.adminLabel)}" placeholder="Например: Аня · группа 1">
          <button id="saveLabelButton" class="button primary" type="button">СОХРАНИТЬ</button>
        </div>
        <small>Исходное имя участника: <b>${escapeHtml(selected.participantName)}</b></small>
      </div>
      <div class="answers-table">
        ${data.characters.map((character, index) => `
          <div class="answer-row">
            <span>${String(character.id).padStart(2, '0')}</span>
            <p><small>${escapeHtml(character.role.toUpperCase())} · ${escapeHtml(character.country.toUpperCase())}</small><b>${escapeHtml(selected.answers[index])}</b><em title="${escapeHtml(character.text)}">${escapeHtml(character.text)}</em></p>
          </div>`).join('')}
      </div>`;

    $('#saveLabelButton').addEventListener('click', saveLabel);
    $('#adminLabelInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') saveLabel();
    });
    $('#deleteButton').addEventListener('click', deleteSelected);
  }

  function saveLabel() {
    const selected = submissions.find(item => item.submissionId === selectedId);
    if (!selected) return;
    selected.adminLabel = $('#adminLabelInput').value.trim().slice(0, 80);
    saveArchive();
    render();
    toast('Метка сохранена.');
  }

  function deleteSelected() {
    const selected = submissions.find(item => item.submissionId === selectedId);
    if (!selected) return;
    if (!confirm(`Удалить анкету «${selected.adminLabel || selected.participantName}»? Это действие нельзя отменить.`)) return;
    submissions = submissions.filter(item => item.submissionId !== selectedId);
    selectedId = sortedSubmissions()[0]?.submissionId || null;
    saveArchive();
    render();
    toast('Анкета удалена.');
  }

  function download(contents, fileName, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file.name.toLowerCase().endsWith('.csv'));
    if (!files.length) {
      toast('Выберите CSV-файлы результатов.');
      return;
    }

    let added = 0;
    let duplicates = 0;
    const errors = [];
    for (const file of files) {
      try {
        const rows = utils.parseCsv(await file.text());
        const submission = utils.submissionFromRows(rows, data.characters);
        const validationError = utils.validateSubmission(submission, data);
        if (validationError) throw new Error(validationError);
        if (submissions.some(item => item.submissionId === submission.submissionId)) {
          duplicates += 1;
          continue;
        }
        submissions.push({ ...submission, adminLabel: '', importedAt: new Date().toISOString() });
        selectedId = submission.submissionId;
        added += 1;
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    saveArchive();
    render();
    $('#resultFiles').value = '';
    if (errors.length) {
      toast(`Добавлено: ${added}. Ошибок: ${errors.length}. ${errors[0]}`);
    } else if (duplicates) {
      toast(`Добавлено: ${added}. Уже были в архиве: ${duplicates}.`);
    } else {
      toast(`Импортировано анкет: ${added}.`);
    }
  }

  function exportCombinedCsv() {
    const ordered = sortedSubmissions();
    if (!ordered.length) {
      toast('Архив пока пуст.');
      return;
    }
    const headers = ['Admin Label', 'Participant', 'Submission ID', 'Created At', ...data.characters.map(character => `Character ${String(character.id).padStart(2, '0')}`)];
    const rows = [headers, ...ordered.map(item => [item.adminLabel, item.participantName, item.submissionId, item.createdAt, ...item.answers])];
    download(utils.encodeCsv(rows), `lokiland-all-results-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  }

  function backupArchive() {
    if (!submissions.length) {
      toast('Архив пока пуст.');
      return;
    }
    const backup = JSON.stringify({
      format: 'LOKILAND_ADMIN_BACKUP',
      version: 1,
      createdAt: new Date().toISOString(),
      submissions
    }, null, 2);
    download(backup, `lokiland-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8');
  }

  async function restoreArchive(file) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== 'LOKILAND_ADMIN_BACKUP' || backup.version !== 1 || !Array.isArray(backup.submissions)) {
        throw new Error('Неподдерживаемый файл резервной копии.');
      }
      const restored = backup.submissions.map(item => ({
        ...item,
        adminLabel: String(item.adminLabel || '').slice(0, 80),
        importedAt: typeof item.importedAt === 'string' && !Number.isNaN(Date.parse(item.importedAt))
          ? new Date(item.importedAt).toISOString()
          : new Date().toISOString()
      }));
      const invalid = restored.find(item => utils.validateSubmission(item, data));
      if (invalid) throw new Error('В резервной копии есть повреждённая анкета.');
      const unique = new Map(submissions.map(item => [item.submissionId, item]));
      restored.forEach(item => unique.set(item.submissionId, item));
      submissions = Array.from(unique.values());
      selectedId = restored[0]?.submissionId || selectedId;
      saveArchive();
      render();
      toast(`Архив восстановлен. Всего анкет: ${submissions.length}.`);
    } catch (error) {
      toast(error.message || 'Не удалось восстановить архив.');
    } finally {
      $('#restoreInput').value = '';
    }
  }

  $('#chooseFilesButton').addEventListener('click', event => {
    event.stopPropagation();
    $('#resultFiles').click();
  });
  $('#dropZone').addEventListener('click', event => {
    if (event.target.closest('#chooseFilesButton')) return;
    $('#resultFiles').click();
  });
  $('#dropZone').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      $('#resultFiles').click();
    }
  });
  ['dragenter', 'dragover'].forEach(type => $('#dropZone').addEventListener(type, event => {
    event.preventDefault();
    $('#dropZone').classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach(type => $('#dropZone').addEventListener(type, event => {
    event.preventDefault();
    $('#dropZone').classList.remove('dragging');
  }));
  $('#dropZone').addEventListener('drop', event => importFiles(event.dataTransfer.files));
  $('#resultFiles').addEventListener('change', event => importFiles(event.target.files));
  $('#searchInput').addEventListener('input', render);
  $('#exportButton').addEventListener('click', exportCombinedCsv);
  $('#backupButton').addEventListener('click', backupArchive);
  $('#restoreButton').addEventListener('click', () => $('#restoreInput').click());
  $('#restoreInput').addEventListener('change', event => restoreArchive(event.target.files[0]));
  $('#clearAllButton').addEventListener('click', () => {
    if (!submissions.length) return toast('Архив уже пуст.');
    if (!confirm(`Удалить все анкеты (${submissions.length}) из этого браузера? Сначала рекомендуется скачать backup.`)) return;
    submissions = [];
    selectedId = null;
    saveArchive();
    render();
    toast('Локальный архив очищен.');
  });

  render();
})();
