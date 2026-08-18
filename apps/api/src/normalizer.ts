import type { NormalizedVehicle } from './types.js';

const cents = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const text = (v: unknown) => Array.isArray(v) ? (v[0] ?? undefined) : (v == null ? '' : String(v).trim()) || undefined;
const ok = (v: unknown) => !text(v) || /NADA CONSTA|NAO POSSUI|NÃO POSSUI|OK|NAO EXISTE/i.test(text(v)!);
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordsFrom(raw: unknown): AnyRecord[] {
  const result: AnyRecord[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || seen.has(value)) return;
    if (isRecord(value)) {
      seen.add(value);
      result.push(value);
      Object.entries(value).forEach(([entryKey, entryValue]) => {
        if (depth < 5 && (isRecord(entryValue) || Array.isArray(entryValue)) && /resposta|retorno|veiculo|veiculos|vehicle|data|result|resultado|dados|response|content|body|extra/i.test(entryKey)) visit(entryValue, depth + 1);
      });
    } else if (Array.isArray(value)) {
      value.slice(0, 5).forEach((item) => visit(item, depth + 1));
    }
  };
  visit(raw, 0);
  return result;
}

function valueOf(raw: unknown, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(key));
  for (const record of recordsFrom(raw)) {
    for (const [field, value] of Object.entries(record)) {
      if (wanted.has(key(field)) && value != null && value !== '') return value;
    }
  }
  return undefined;
}

function successfulResponse(raw: unknown): boolean {
  const responseCode = valueOf(raw, ['CODIGO', 'codigoResposta', 'statusCode', 'httpStatus']);
  if (responseCode == null || responseCode === '') return true;
  const normalized = key(String(responseCode));
  return normalized === '1' || normalized === '200' || normalized === 'OK' || normalized === 'SUCCESS' || normalized === 'SUCESSO';
}

export function normalizeBdrp(raw: any): NormalizedVehicle {
  if (!successfulResponse(raw)) throw new Error('Resposta do provedor inválida');
  const plate = text(valueOf(raw, ['PLACA', 'plate', 'licensePlate', 'placaVeiculo']));
  const brand = text(valueOf(raw, ['MARCA', 'brand', 'make', 'marcaVeiculo']));
  const model = text(valueOf(raw, ['MODELO', 'model', 'modeloVeiculo']));
  const fullModel = text(valueOf(raw, ['MARCAMODELOCOMPLETO', 'marcaModeloCompleto', 'marcaModelo', 'marca_modelo', 'fullModel', 'fullVehicleModel']));
  if (!plate || (!brand && !model && !fullModel)) throw new Error('Resposta do provedor inválida');
  return {
    identification: {
      plate,
      renavam: text(valueOf(raw, ['RENAVAM', 'renavam'])),
      chassis: text(valueOf(raw, ['CHASSI', 'chassis', 'chassi'])),
      engine: text(valueOf(raw, ['MOTOR', 'engine', 'numeroMotor'])),
      gearbox: text(valueOf(raw, ['NUMEROCAIXACAMBIO', 'gearbox', 'cambio', 'numeroCambio'])),
      brand,
      model,
      fullModel
    },
    characteristics: {
      manufactureYear: text(valueOf(raw, ['VEIANOFAB', 'anoFabricacao', 'ano', 'manufactureYear', 'fabricationYear'])),
      modelYear: text(valueOf(raw, ['VEIANOMODELO', 'anoModelo', 'ano_modelo', 'modelYear'])),
      color: text(valueOf(raw, ['COR', 'color'])),
      fuel: text(valueOf(raw, ['COMBUSTIVEL', 'fuel', 'combustivel', 'combustível'])),
      power: text(valueOf(raw, ['POTENCIA', 'power'])),
      displacement: text(valueOf(raw, ['CILINDRADA', 'displacement'])),
      type: text(valueOf(raw, ['TIPO', 'type', 'vehicleType', 'tipoVeiculo', 'tipo_veiculo'])),
      species: text(valueOf(raw, ['ESPECIE', 'species'])),
      category: text(valueOf(raw, ['VEICATEGORIA', 'categoria', 'category'])),
      body: text(valueOf(raw, ['CARROCERIA', 'body', 'bodyType'])),
      axles: text(valueOf(raw, ['EIXOS', 'axles'])),
      passengers: text(valueOf(raw, ['CAPACIDADEPASSAG', 'passageiros', 'passengers'])),
      loadCapacity: text(valueOf(raw, ['CAPACIDADECARGA', 'capacidadeCarga', 'loadCapacity'])),
      origin: text(valueOf(raw, ['VEIPROCEDENCIA', 'procedencia', 'origin']))
    },
    registration: {
      city: text(valueOf(raw, ['MUNICIPIO', 'municipio', 'municipality', 'city', 'cidade'])),
      state: text(valueOf(raw, ['UF', 'ufPlaca', 'uf_placa', 'estado', 'state'])),
      licensingDate: text(valueOf(raw, ['LICDATA', 'dataLicenciamento', 'licensingDate'])),
      licensingYear: text(valueOf(raw, ['LICEXELIC', 'anoLicenciamento', 'licensingYear'])),
      status: text(valueOf(raw, ['SITUACAOVEICULO', 'situacaoVeiculo', 'status', 'vehicleStatus']))
    },
    owner: {
      name: text(valueOf(raw, ['PRONOME', 'nomeProprietario', 'ownerName'])),
      document: text(valueOf(raw, ['CPF_CNPJ_PROPRIETARIO', 'cpfCnpjProprietario', 'ownerDocument'])),
      documentType: text(valueOf(raw, ['TIPODOCUMENTOPROPRIETARIO', 'tipoDocumentoProprietario', 'ownerDocumentType']))
    },
    debts: [
      ['MULTAS', 'Multas', valueOf(raw, ['VALORTOTALDEBITOMULTA', 'valorTotalDebitoMulta', 'finesAmount'])],
      ['LICENCIAMENTO', 'Licenciamento', valueOf(raw, ['EXISTEDEBITODELICENCIAMENTOVL', 'debitoLicenciamento', 'licensingDebt'])],
      ['IPVA', 'IPVA', valueOf(raw, ['DEBIPVA', 'debitoIpva', 'ipvaDebt'])],
      ['DETRAN', 'DETRAN', valueOf(raw, ['DEBDETRAN', 'debitoDetran'])],
      ['DER', 'DER', valueOf(raw, ['DEBDER', 'debitoDer'])],
      ['PRF', 'Polícia Rodoviária Federal', valueOf(raw, ['DEBPOLRODFED', 'debitoPrf'])],
      ['RENAINF', 'RENAINF', valueOf(raw, ['DEBRENAINF', 'debitoRenainf'])],
      ['MUNICIPAIS', 'Débitos municipais', valueOf(raw, ['DEBMUNICIPAIS', 'debitoMunicipal'])]
    ].map(([debtKey, label, value]) => ({ key: String(debtKey), label: String(label), amountCents: cents(value), hasDebt: cents(value) > 0 })),
    restrictions: [
      ['FURTO', 'Furto/Roubo', valueOf(raw, ['RESFURTO', 'furtoRoubo', 'theftRestriction'])],
      ['JUDICIAL', 'Judicial', valueOf(raw, ['RESJUDICIAL', 'restricaoJudicial', 'judicialRestriction'])],
      ['RENAJUD', 'RENAJUD', valueOf(raw, ['RESRENAJUD', 'renajud'])],
      ['ADMIN', 'Administrativa', valueOf(raw, ['RESADMINISTRATIVA', 'restricaoAdministrativa'])],
      ['TRIBUTARIA', 'Tributária', valueOf(raw, ['RESTRIBUTARIA', 'restricaoTributaria'])],
      ['FINANCEIRA', 'Financeira', valueOf(raw, ['RESTRICAOFINAN', 'restricaoFinanceira'])],
      ['RFB', 'Receita Federal', valueOf(raw, ['RESTRICAORFB', 'restricaoReceitaFederal'])],
      ['AMBIENTAL', 'Ambiental', valueOf(raw, ['RESAMBIENTAL', 'restricaoAmbiental'])]
    ].map(([restrictionKey, label, status]) => ({ key: String(restrictionKey), label: String(label), status: text(status) ?? 'SEM INFORMACAO', alert: !ok(status) })),
    recall: text(valueOf(raw, ['RECALL', 'recall']))
  };
}

export function normalizeFipe(raw: any): Omit<import('./types.js').FipeProviderResult, 'cacheKey'> {
  const price = typeof raw?.price === 'string' ? raw.price : typeof raw?.valor === 'string' ? raw.valor : raw?.price;
  const normalizedPrice = String(price ?? '').trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
  const value = Number(normalizedPrice);
  if (!raw || !Number.isFinite(value) || value <= 0) throw new Error('FIPE_INVALID_RESPONSE');
  const vehicleType = raw.vehicleType === 2 || raw.tipoVeiculo === 2 || raw.tipoVeiculo === '2' ? 'motorcycles' : raw.vehicleType === 3 || raw.tipoVeiculo === 3 || raw.tipoVeiculo === '3' ? 'trucks' : 'cars';
  const brand = { code: String(raw.brandCode ?? raw.codigoMarca ?? raw.marcaCodigo ?? '').trim(), name: String(raw.brand ?? raw.marca ?? '').trim() };
  const model = { code: String(raw.modelCode ?? raw.codigoModelo ?? raw.modeloCodigo ?? '').trim(), name: String(raw.model ?? raw.modelo ?? '').trim() };
  const year = { code: String(raw.yearCode ?? raw.codigoAno ?? raw.anoCodigo ?? '').trim(), name: String(raw.year ?? raw.ano ?? raw.modelYear ?? raw.anoModelo ?? '').trim() };
  if (!brand.name || !model.name || !year.name || !String(raw.codeFipe ?? raw.codigoFipe).trim()) throw new Error('FIPE_INVALID_RESPONSE');
  const referenceMonth = String(raw.referenceMonth ?? raw.mesReferencia ?? raw.referencia ?? '').trim();
  if (!referenceMonth) throw new Error('FIPE_REFERENCE_MISSING');
  return {
    provider: String(raw.provider ?? 'fipe').trim(),
    source: String(raw.source ?? 'Tabela FIPE').trim(),
    consultedAt: new Date().toISOString(),
    referenceMonth,
    referenceCode: raw.referenceCode == null ? undefined : String(raw.referenceCode),
    vehicleType,
    brand,
    model,
    year,
    fuel: String(raw.fuel ?? raw.combustivel ?? '').trim() || undefined,
    modelYear: Number.isFinite(Number(raw.modelYear ?? raw.anoModelo)) ? Number(raw.modelYear ?? raw.anoModelo) : undefined,
    fipeCode: String(raw.codeFipe ?? raw.codigoFipe).trim(),
    valueCents: Math.round(value * 100),
    valueLabel: `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  };
}
