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

const genderOffsets = { male: 0, female: 0 };
const answers = Array.from(data.characters, character => {
  const answer = data.names[character.gender][genderOffsets[character.gender]];
  genderOffsets[character.gender] += 1;
  return answer;
});

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

test('name from wrong gender list is rejected', () => {
  const wrongAnswers = Array.from(answers);
  wrongAnswers[0] = answers[1];
  assert.match(utils.validateSubmission(makeSubmission({ answers: wrongAnswers }), data), /Недопустимое имя/);
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
