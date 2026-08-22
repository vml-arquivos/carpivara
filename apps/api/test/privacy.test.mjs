import assert from 'node:assert/strict';
import test from 'node:test';
import { publicVehicleResult, redactPrivateFields } from '../dist/privacy.js';

test('remove proprietário do resultado público de consulta paga', () => {
  const result = publicVehicleResult({
    identification: { brand: 'Fiat', model: 'Argo', year: '2023' },
    owner: { name: 'Pessoa Teste', document: '00000000000', documentType: 'CPF' },
    debts: [],
    restrictions: [],
    recall: [],
    coverage: {}
  });
  assert.equal('owner' in result, false);
  assert.deepEqual(result.identification, { brand: 'Fiat', model: 'Argo', year: '2023' });
});

test('remove campos pessoais de configurações de relatório sem alterar dados veiculares', () => {
  const result = redactPrivateFields({
    identification: { brand: 'Fiat', model: 'Argo' },
    owner: { name: 'Pessoa Teste', document: '00000000000' },
    address: 'Rua reservada',
    restrictions: [{ label: 'Alienação', alert: true }]
  });
  assert.deepEqual(result, {
    identification: { brand: 'Fiat', model: 'Argo' },
    restrictions: [{ label: 'Alienação', alert: true }]
  });
});
