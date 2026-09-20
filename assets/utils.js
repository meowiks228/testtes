(() => {
  const dangerousFormula = /^[=+\-@]/;

  function csvProtect(value) {
    const text = String(value ?? '');
    return dangerousFormula.test(text) ? `\t${text}` : text;
  }

  function csvRestore(value) {
    const text = String(value ?? '');
    return /^\t[=+\-@]/.test(text) ? text.slice(1) : text;
  }

  function encodeCsv(rows) {
    return '﻿' + rows.map(row => row.map(value => {
      const escaped = csvProtect(value).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(';')).join('\r\n');
  }

  function parseCsv(source) {
    const text = String(source ?? '').replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    let justClosedQuote = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
          justClosedQuote = true;
        } else {
          cell += char;
        }
      } else if (justClosedQuote) {
        if (char === ';') {
          row.push(csvRestore(cell));
          cell = '';
          justClosedQuote = false;
        } else if (char === '\n') {
          row.push(csvRestore(cell.replace(/\r$/, '')));
          rows.push(row);
          row = [];
          cell = '';
          justClosedQuote = false;
        } else if (char !== '\r') {
          throw new Error('После закрывающей кавычки найден лишний символ.');
        }
      } else if (char === '"') {
        if (cell) throw new Error('Кавычка внутри неэкранированного поля.');
        quoted = true;
      } else if (char === ';') {
        row.push(csvRestore(cell));
        cell = '';
      } else if (char === '\n') {
        row.push(csvRestore(cell.replace(/\r$/, '')));
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }

    if (quoted) throw new Error('В CSV-файле не закрыты кавычки.');
    if (cell.length || row.length) {
      row.push(csvRestore(cell.replace(/\r$/, '')));
      rows.push(row);
    }
    return rows.filter(item => item.some(value => value !== ''));
  }

  function createSubmission(participantName, answers) {
    const randomId = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `ll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return {
      format: 'LOKILAND_RESULTS',
      version: '1',
      submissionId: randomId,
      participantName: String(participantName).trim(),
      createdAt: new Date().toISOString(),
      answers: answers.slice()
    };
  }

  function submissionRows(submission, characters) {
    const headers = ['Format', 'Version', 'Submission ID', 'Participant', 'Created At', ...characters.map(character => `Character ${String(character.id).padStart(2, '0')}`)];
    const values = [submission.format, submission.version, submission.submissionId, submission.participantName, submission.createdAt, ...submission.answers];
    return [headers, values];
  }

  function submissionFromRows(rows, characters) {
    if (rows.length !== 2) throw new Error('Ожидалась таблица с заголовком и одной анкетой.');
    const expectedHeaders = submissionRows({ format: '', version: '', submissionId: '', participantName: '', createdAt: '', answers: [] }, characters)[0];
    if (rows[0].length !== expectedHeaders.length || rows[0].some((cell, index) => cell !== expectedHeaders[index])) {
      throw new Error('Файл не похож на результат теста Локиленда.');
    }
    if (rows[1].length !== expectedHeaders.length) throw new Error('В анкете неверное число колонок.');
    return {
      format: rows[1][0],
      version: rows[1][1],
      submissionId: rows[1][2],
      participantName: rows[1][3],
      createdAt: rows[1][4],
      answers: rows[1].slice(5)
    };
  }

  function validateSubmission(submission, data) {
    if (!submission || submission.format !== data.format || submission.version !== data.version) return 'Неподдерживаемый формат файла.';
    if (typeof submission.submissionId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(submission.submissionId)) return 'Некорректный ID анкеты.';
    if (typeof submission.participantName !== 'string') return 'Некорректное имя участника.';
    const participantName = submission.participantName.trim();
    if (participantName.length < 2 || participantName.length > 60) return 'Некорректное имя участника.';
    if (typeof submission.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(submission.createdAt) || Number.isNaN(Date.parse(submission.createdAt))) return 'Некорректная дата анкеты.';
    if (!Array.isArray(submission.answers) || submission.answers.length !== data.characters.length) return `Ожидалось ${data.characters.length} ответов.`;

    const allowed = data.allNames || [...data.names.male, ...data.names.female];
    const used = new Set();
    for (let index = 0; index < data.characters.length; index += 1) {
      const answer = submission.answers[index];
      if (!allowed.includes(answer)) return `Недопустимое имя в ответе №${index + 1}.`;
      if (used.has(answer)) return `Имя «${answer}» использовано повторно.`;
      used.add(answer);
    }
    return null;
  }

  function formatShareText(submission, characters) {
    const lines = characters.map((character, index) => {
      return `${String(character.id).padStart(2, '0')}. ${character.role} — ${submission.answers[index]}`;
    });
    return [
      `ЛАГЕРЬ ЛОКИЛЕНД — ответы ${submission.participantName}`,
      '',
      ...lines,
      '',
      `ID анкеты: ${submission.submissionId}`
    ].join('\n');
  }

  function safeFilePart(value) {
    return String(value || 'participant')
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'participant';
  }

  const api = { csvProtect, csvRestore, encodeCsv, parseCsv, createSubmission, submissionRows, submissionFromRows, validateSubmission, formatShareText, safeFilePart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalThis.LokilandUtils = api;
})();
