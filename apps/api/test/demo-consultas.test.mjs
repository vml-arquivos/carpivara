import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'disabled';
process.env.DATABASE_URL = 'postgresql://demo@127.0.0.1/demo';
process.env.JWT_SECRET = 'demo-test-secret-without-real-credentials';
const { demoExamples, demoReport, demoPdf } = await import('../dist/report/demo.js');

test('todos os exemplos têm placa consistente e PDF com o mesmo relatório', async () => {
  assert.equal(demoExamples.length, 7);
  assert.equal(new Set(demoExamples.map(({ plate }) => plate)).size, 3);
  for (const example of demoExamples) {
    const data = demoReport(example.id);
    assert.equal(data.report.plate, example.plate);
    assert.equal(data.productName, example.name);
    assert.ok(data.report.sections.every(({ key }) => key !== 'INTERNO'));
    assert.match((await demoPdf(example.id)).subarray(0, 5).toString(), /^%PDF-/);
  }
});

test('os casos preservam seus alertas, valores e limites de cobertura', async () => {
  assert.equal(demoReport('avancada').report.debts.totalCents, 128040);
  assert.equal(demoReport('gravame').report.debtsHidden, true);
  assert.deepEqual(demoReport('fipe').report.sections.map(({ key }) => key), ['IDENTIFICACAO', 'FIPE']);
  assert.deepEqual(demoReport('premium').report.verdict.alerts.map(({ key }) => key), ['VT_SINISTRO', 'VT_LEILAO', 'VT_RECALL']);
  assert.equal(demoReport('TST1A01'), null);
  assert.equal(await demoPdf('inexistente'), null);
});
