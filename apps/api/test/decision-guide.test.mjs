import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionGuide, orderGuide } from '../dist/report/decisionGuide.js';

test('guia usa apenas alertas públicos e separa campos sem retorno da cobertura', () => {
  const report = {
    sections: [{ label: 'Histórico', items: [
      { key: 'VT_LEILAO', label: 'Leilão', state: 'ALERT', sensitivity: 'PUBLIC', display: 'Registro disponível' },
      { key: 'VT_SINISTRO', state: 'NOT_PROVIDED', sensitivity: 'PUBLIC' },
      { key: 'VT_RECALL', state: 'ALERT', sensitivity: 'OWNER' },
      { key: 'VT_ROUBOFURTO', state: 'ALERT', sensitivity: 'PUBLIC', masked: true }
    ] }],
    scope: { notIncluded: [{ label: 'Débitos' }] }
  };
  const guide = buildDecisionGuide(report);
  assert.deepEqual(guide.findings.map(({ id, detail }) => [id, detail]), [['auction', 'Registro disponível']]);
  assert.deepEqual(guide.notProvided, ['Histórico']);
  assert.deepEqual(guide.outsideCoverage, ['Débitos']);
});

test('IA só pode ordenar códigos existentes sem adicionar ou remover orientação', () => {
  const findings = [{ id: 'auction' }, { id: 'debt' }];
  assert.deepEqual(orderGuide(findings, 'debt, auction'), [...findings].reverse());
  for (const reply of [null, 'debt', 'debt, debt', 'debt, invented']) assert.deepEqual(orderGuide(findings, reply), findings);
});
