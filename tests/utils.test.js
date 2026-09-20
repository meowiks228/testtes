const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dataContext = { window: {} };
vm.createContext(dataContext);
vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'data.js'), 'utf8'), dataContext);
const data = dataContext.window.LokilandData;
const utils = require('../assets/utils.js');

const answers = Array.from(data.allNames);

function makeSubmission(overrides = {}) {
  return {
    format: data.format,
    version: data.version,
    submissionId: '12345678-1234-1234-1234-123456789abc',
    participantName: 'Тестовый участник',
    createdAt: '2026-09-21T12:00:00.000Z',
    answers: Array.from(answers),
    ...overrides
  };
}

test('valid submission passes validation', () => {
  assert.equal(utils.validateSubmission(makeSubmission(), data), null);
});

test('duplicate name is rejected', () => {
  const duplicateAnswers = Array.from(answers);
  duplicateAnswers[2] = duplicateAnswers[0];
  assert.match(utils.validateSubmission(makeSubmission({ answers: duplicateAnswers }), data), /повторно/);
});

test('cross-category name assignments are accepted', () => {
  const mixedAnswers = Array.from(answers);
  [mixedAnswers[0], mixedAnswers[7]] = [mixedAnswers[7], mixedAnswers[0]];
  assert.equal(utils.validateSubmission(makeSubmission({ answers: mixedAnswers }), data), null);
});

test('unknown name is rejected', () => {
  const unknownAnswers = Array.from(answers);
  unknownAnswers[0] = 'Неизвестное Имя';
  assert.match(utils.validateSubmission(makeSubmission({ answers: unknownAnswers }), data), /Недопустимое имя/);
});

test('CSV round trip preserves Cyrillic, quotes and formulas safely', () => {
  const rows = [
    ['Имя', 'Комментарий'],
    ['Иван "Тест"', '=2+2'],
    ['Мария', 'Строка\nперенос']
  ];
  const encoded = utils.encodeCsv(rows);
  assert.ok(encoded.startsWith('﻿'));
  assert.deepEqual(utils.parseCsv(encoded), rows);
});

test('submission CSV round trip remains valid', () => {
  const original = makeSubmission();
  const encoded = utils.encodeCsv(utils.submissionRows(original, data.characters));
  const restored = utils.submissionFromRows(utils.parseCsv(encoded), data.characters);
  assert.deepEqual(restored, original);
  assert.equal(utils.validateSubmission(restored, data), null);
});

test('numeric IDs and non-ISO dates are rejected', () => {
  assert.match(utils.validateSubmission(makeSubmission({ submissionId: 12345678 }), data), /ID/);
  assert.match(utils.validateSubmission(makeSubmission({ createdAt: '0' }), data), /дата/);
});

test('malformed text after a closing CSV quote is rejected', () => {
  assert.throws(() => utils.parseCsv('"Имя"x;"Ответ"'), /лишний символ/);
});

test('all name categories contain 14 unique names', () => {
  assert.equal(data.allNames.length, 14);
  assert.equal(new Set(data.allNames).size, 14);
});

test('share text contains participant and every answer', () => {
  const text = utils.formatShareText(makeSubmission(), data.characters);
  assert.match(text, /Тестовый участник/);
  assert.match(text, /01\. Контент-креатор — Джаспер Белл/);
  assert.match(text, /14\. Коуч по заработку — Челси Рид/);
  assert.equal(text.split('\n').filter(line => /^\d{2}\./.test(line)).length, 14);
});
