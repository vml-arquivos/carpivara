import { BRAND } from '../lib/brand.js';
import { scopeForProduct } from '../lib/reportScope.js';
import { buildReportV2, viewReport } from './normalizeV2.js';
import { renderVehiclePdf } from './pdf.js';
import { SAMPLE_RAW } from './sample.js';

type Scenario = 'clean' | 'finance' | 'auction';
const vehicles = {
  clean: { plate: 'TST1A01', model: 'Hatch 1.0', year: '2022', color: 'PRATA', power: '76', displacement: '1000', value: '54.900,00', cents: 5490000 },
  finance: { plate: 'TST1A02', model: 'SUV 1.6', year: '2020', color: 'PRETO', power: '120', displacement: '1600', value: '79.800,00', cents: 7980000 },
  auction: { plate: 'TST1A03', model: 'Picape 2.0', year: '2019', color: 'BRANCO', power: '170', displacement: '2000', value: '88.500,00', cents: 8850000 }
} satisfies Record<Scenario, { plate: string; model: string; year: string; color: string; power: string; displacement: string; value: string; cents: number }>;

const identity = ['IDENTIFICACAO', 'CARACTERISTICAS', 'REGISTRO'];
const overview = [...identity, 'DEBITOS', 'RESTRICOES', 'GRAVAME', 'HISTORICO', 'INSPECAO_RECALL', 'FIPE', 'ANALISES'];
const examples = [
  { id: 'fipe', product: 'FIPE_FREE', name: 'FIPE grátis', scenario: 'clean', summary: 'Valor de referência e histórico mensal simulado', sections: ['IDENTIFICACAO', 'FIPE'] },
  { id: 'cadastral', product: 'CADASTRAL', name: 'Consulta Cadastral', scenario: 'clean', summary: 'Identificação e características do veículo', sections: identity },
  { id: 'gravame', product: 'LIEN', name: 'Consulta Gravame', scenario: 'finance', summary: 'Alienação ativa, instituição, contrato e data de inclusão', sections: ['IDENTIFICACAO', 'GRAVAME'] },
  { id: 'leilao', product: 'AUCTION', name: 'Leilão e Dados do Veículo', scenario: 'auction', summary: 'Passagem por leilão com data, lote e condição', sections: [...identity, 'RESTRICOES', 'HISTORICO', 'ANALISES'] },
  { id: 'avancada', product: 'BASIC', name: 'Consulta Avançada', scenario: 'finance', summary: 'Débitos simulados e restrição financeira', sections: overview },
  { id: 'completa', product: 'COMPLETE', name: 'Consulta Completa', scenario: 'clean', summary: 'Cadastro, débitos, restrições e histórico sem apontamentos no exemplo', sections: overview },
  { id: 'premium', product: 'PREMIUM', name: 'Consulta Premium', scenario: 'auction', summary: 'Leilão, indício de sinistro, recall e histórico fictício', sections: [...overview, 'PROPRIETARIO'] }
] as const;

export const demoExamples = examples.map(({ id, name, scenario, summary }) => ({ id, name, summary, plate: vehicles[scenario].plate }));

const consultedAt = '2026-11-01T12:00:00.000Z';
type RecordBlock = Record<string, string>;
type DemoRaw = {
  RESPOSTA: {
    CODIGO: string[];
    VEICULOSBDRP: { RETORNO: RecordBlock };
    VEICULARBNACIONAL: { REGISTRO_1: RecordBlock };
    PRECIFICADORFIPE: { REGISTRO_1: RecordBlock };
    HISTORICOPROPRIETARIO?: { REGISTRO_1: RecordBlock; REGISTRO_2: RecordBlock };
    INDICIOSINISTROVEICULAR: RecordBlock;
    RECALL: object;
    LEILAOCONJUGADO: object;
  };
};

function demoInput(scenario: Scenario, owners: boolean) {
  const vehicle = vehicles[scenario];
  const suffix = vehicle.plate.slice(-2);
  const raw = structuredClone(SAMPLE_RAW) as DemoRaw;
  const blocks = raw.RESPOSTA;
  const state = blocks.VEICULOSBDRP.RETORNO;
  const national = blocks.VEICULARBNACIONAL.REGISTRO_1;
  const fipe = blocks.PRECIFICADORFIPE.REGISTRO_1;
  const id = { PLACA: vehicle.plate, CHASSI: `DEM000000000000${suffix}`, RENAVAM: `000000000${suffix}` };
  const specs = { POTENCIA: vehicle.power, CILINDRADA: vehicle.displacement };
  Object.assign(state, id, specs, {
    MARCA: 'DEMO', MODELO: vehicle.model, MARCAMODELOCOMPLETO: `DEMO/${vehicle.model}`,
    VEIANOFABR: vehicle.year, VEIANOMODELO: vehicle.year, COR: vehicle.color,
    MOTOR: `DEMO${suffix}`, PRONOME: '', PRONOMEANTERIOR: '', CPF_CNPJ_PROPRIETARIO: '', CPFCNPJFATURADO: '',
    DATAEMISSAOCRV: `15/03/${vehicle.year}`, RESTRICAOFINAN: 'NADA CONSTA',
    RESTRICAONOMEAGENTE: '', CGCFINANCEIRA: '', RESTRICAODATAINCLUSAO: '', NUMEROCONTRATOFINANCEIRA: ''
  });
  Object.assign(national, id, specs, {
    NUMERO_MOTOR: `DEMO${suffix}`,
    PLACA_MODELO_NOVO: vehicle.plate, MARCA: 'DEMO', MODELO: `DEMO/${vehicle.model}`, COR: vehicle.color,
    ANO_FABRICACAO: vehicle.year, ANO_MODELO: vehicle.year, IDENTIFICACAO_FATURADO: '',
    DATA_EMPLACAMENTO: `15/03/${vehicle.year}`
  });
  Object.assign(fipe, {
    CHASSI: id.CHASSI, CODIGOFIPE: 'DEMO', FABRICANTEFIPE: 'DEMO', MODELOFIPE: vehicle.model,
    ANOMODELOFIPE: vehicle.year, PRECOFIPE: vehicle.value, PRECOMEDIO: vehicle.value, VIGENCIA: '11/2026'
  });
  if (owners && blocks.HISTORICOPROPRIETARIO) {
    for (const [index, row] of [blocks.HISTORICOPROPRIETARIO.REGISTRO_1, blocks.HISTORICOPROPRIETARIO.REGISTRO_2].entries()) {
      Object.assign(row, id, { NOME_PROPRIETARIO: `TITULAR FICTÍCIO ${index + 1}`, CGC_CPF: '', ANO_EXERCICIO: index ? vehicle.year : '2024', DATA_PROCESSAMENTO: index ? vehicle.year : '2024' });
    }
  } else delete blocks.HISTORICOPROPRIETARIO;

  if (scenario === 'finance') Object.assign(state, {
    EXISTEDEBITODEIPVA: 'EXISTE DEBITO DE IPVA', DEBIPVA: '900,00',
    EXISTEDEBITODEMULTA: 'EXISTE DEBITO DE MULTA', VALORTOTALDEBITOMULTA: '250,00',
    EXISTEDEBITODELICENCIAMENTO: 'EXISTE DEBITO DE LICENCIAMENTO', EXISTEDEBITODELICENCIAMENTOVL: '130,40',
    RESTRICAOFINAN: 'ALIENACAO FIDUCIARIA', RESTRICAONOMEAGENTE: 'BANCO DEMONSTRAÇÃO',
    RESTRICAODATAINCLUSAO: '10/03/2024', NUMEROCONTRATOFINANCEIRA: 'DEMO-0002'
  });
  if (scenario === 'auction') {
    blocks.CODIGO[1] = '1';
    blocks.CODIGO[3] = '1';
    blocks.INDICIOSINISTROVEICULAR.INDICIODESINISTRO = '1';
    blocks.LEILAOCONJUGADO = { DESCRICAORETORNO: 'REGISTRO ENCONTRADO', REGISTRO_1: {
      DATA: '21/08/2023', LEILOEIRO: 'LEILÕES DEMONSTRAÇÃO', LOTE: 'DEMO-17', STATUS: 'ARREMATADO', UF: 'SP'
    } };
    blocks.RECALL = { DESCRICAORETORNO: 'RECALL PENDENTE', REGISTRO_1: {
      CAMPANHA: 'DEMO-2025', DATA: '15/07/2025', DESCRICAO: 'Inspeção do sistema de freios'
    } };
  }
  const series = Array.from({ length: 24 }, (_, index) => {
    const time = 2026 * 12 + 10 - (23 - index);
    return { time, label: `${String(time % 12 + 1).padStart(2, '0')}/${Math.floor(time / 12)}`, cents: vehicle.cents + (23 - index) * 12000 };
  });
  return { ...raw, enrichment: { fipeHistory: { series }, generatedAt: consultedAt } };
}

export function demoReport(id: string) {
  const example = examples.find((item) => item.id === id);
  if (!example) return null;
  const report = buildReportV2(demoInput(example.scenario, example.product === 'PREMIUM'));
  const scope = scopeForProduct(example.product);
  return {
    productName: example.name, consultedAt,
    report: viewReport(report, {
      audience: 'client', tier: 3,
      sections: example.product === 'FIPE_FREE' ? [...example.sections] : scope.sections ?? [...example.sections],
      template: example.product === 'FIPE_FREE' ? null : scope.template
    })
  };
}

// As chaves são limitadas aos exemplos publicados. O modo demonstração não abre uma consulta nem grava um relatório.
const pdfs = new Map<string, { signature: string; pdf: Promise<Buffer> }>();
export async function demoPdf(id: string): Promise<Buffer | null> {
  const data = demoReport(id);
  if (!data) return null;
  const signature = JSON.stringify(data);
  const cached = pdfs.get(id);
  if (cached?.signature === signature) return cached.pdf;
  const pdf = renderVehiclePdf(data.report, {
    productName: data.productName, verificationCode: 'DEMONSTRAÇÃO',
    verificationUrl: `${BRAND.url}/demonstracao`, consultedAt: new Date(data.consultedAt), sample: true, demonstration: true
  });
  pdfs.set(id, { signature, pdf });
  try { return await pdf; } catch (error) {
    if (pdfs.get(id)?.pdf === pdf) pdfs.delete(id);
    throw error;
  }
}
