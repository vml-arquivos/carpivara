import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBdrp } from '../dist/normalizer.js';

function payload(overrides = {}) {
  return {
    RESPOSTA: {
      CODIGO: '1',
      VEICULOSBDRP: {
        RETORNO: {
          PLACA: 'TST0A00', MARCA: 'NOVA MOTORS', MODELO: 'ECO X', MARCAMODELOCOMPLETO: 'NOVA MOTORS/ECO X',
          VEIANOFABR: '2022', VEIANOMODELO: '2023', COR: 'PRATA', COMBUSTIVEL: 'FLEX',
          MUNICIPIO: 'GOIANIA', UF: 'GO', SITUACAOVEICULO: 'CIRCULACAO',
          DEBIPVA: '1.825,00', VALORTOTALDEBITOMULTA: '459,00', EXISTEDEBITODELICENCIAMENTOVL: '0,00',
          RESFURTO: 'NADA CONSTA', RESJUDICIAL: 'NADA CONSTA', RESRENAJUD: 'NADA CONSTA', RESADMINISTRATIVA: 'NADA CONSTA',
          RESTRIBUTARIA: 'NADA CONSTA', RESTRICAOFINAN: 'NADA CONSTA', RESTRICAORFB: 'NAO POSSUI RESTRICAO RFB', RESAMBIENTAL: 'OK',
          RECALL: 'NAO POSSUI RECALL',
          ...overrides
        }
      }
    }
  };
}

test('normaliza valores monetários e mantém dados de relatório independentes do fornecedor', () => {
  const report = normalizeBdrp(payload());
  assert.equal(report.identification.plate, 'TST0A00');
  assert.equal(report.identification.fullModel, 'NOVA MOTORS/ECO X');
  assert.equal(report.debts.find((item) => item.key === 'IPVA')?.amountCents, 182500);
  assert.equal(report.debts.find((item) => item.key === 'MULTAS')?.amountCents, 45900);
  assert.equal(report.restrictions.every((item) => !item.alert), true);
});

test('sinaliza restrição material sem depender apenas da apresentação', () => {
  const report = normalizeBdrp(payload({ RESJUDICIAL: 'RESTRICAO FICTICIA PARA TESTE' }));
  const judicial = report.restrictions.find((item) => item.key === 'JUDICIAL');
  assert.equal(judicial?.alert, true);
  assert.equal(judicial?.status, 'RESTRICAO FICTICIA PARA TESTE');
});

test('rejeita resposta de provedor incompatível', () => {
  assert.throws(() => normalizeBdrp({ RESPOSTA: { CODIGO: '0' } }), /Resposta do provedor inválida/);
});
