/**
 * Completa em camadas: em vez de comprar o pacote Veículo Total, o sistema chama a consulta base e só as consultas que
 * o relatório precisa, e monta uma resposta no MESMO formato do Veículo Total (blocos + vetor de códigos). Assim todo o
 * relatório (telas, PDF, API, avisos de mudança) continua igual. Este módulo é puro: não chama a Credify nem lê variáveis.
 */
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const scalar = (v: unknown): string => (Array.isArray(v) ? scalar(v.find((x) => String(x ?? '').trim() !== '')) : v == null || isRec(v) ? '' : String(v).trim());
const upperKeys = (o: Rec): Rec => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toUpperCase(), v]));

/** Ordem dos blocos no vetor CODIGO do Veículo Total. */
export const LAYER_ORDER = ['INDICIOSINISTROVEICULAR', 'RECALL', 'HISTORICOROUBOFURTO', 'LEILAOCONJUGADO', 'HISTORICOPROPRIETARIO', 'VEICULARBNACIONAL', 'PRECIFICADORFIPE', 'VEICULOSBDRP'] as const;
export type LayerBlock = (typeof LAYER_ORDER)[number];

/** Resultado de uma consulta avulsa: dados, "não encontrado" ou nada (falhou ou não foi chamada). */
export type Piece = { kind: 'data'; resposta: Rec } | { kind: 'notFound' } | { kind: 'none'; code?: string };

/**
 * Vocabulário único dos estados de uma informação (diretiva do dono do produto). Todo o resto do relatório deriva daqui;
 * nenhum módulo decide sozinho o que é "nada consta".
 *  - OCCURRENCE     (E1) a fonte achou algo;
 *  - CONFIRMED_NONE (E2) a fonte afirmou, com todas as letras, que não há nada para esta placa;
 *  - NO_RETURN      (E3) a fonte respondeu, mas sem este dado ("NÃO INFORMADO", "NÃO DISPONÍVEL", bloco vazio);
 *  - OUT_OF_SCOPE   (E4) a base que verificaria este item não foi acionada nesta consulta (fora do contrato ou do teto de custo);
 *  - UNAVAILABLE    (E5) a base não respondeu: erro, recusa, timeout, HTTP 404/410 do endpoint.
 * E3, E4 e E5 nunca podem ser apresentados como "nada consta".
 */
export type SourceState = 'OCCURRENCE' | 'CONFIRMED_NONE' | 'NO_RETURN' | 'OUT_OF_SCOPE' | 'UNAVAILABLE';
export const SOURCE_STATES: readonly SourceState[] = ['OCCURRENCE', 'CONFIRMED_NONE', 'NO_RETURN', 'OUT_OF_SCOPE', 'UNAVAILABLE'];
export const STATE_LABEL: Record<SourceState, string> = {
  OCCURRENCE: 'ocorrência encontrada',
  CONFIRMED_NONE: 'nada consta confirmado pela fonte',
  NO_RETURN: 'sem retorno da fonte',
  OUT_OF_SCOPE: 'fora da cobertura do pacote',
  UNAVAILABLE: 'consulta indisponível'
};
/** Frase colocada no lugar do dado que não veio. Começa com "Não informado" para que o documento do cliente (clientDoc) a retire, como já faz com os outros avisos de lacuna. */
export const STATE_LINE: Record<SourceState, string> = {
  OCCURRENCE: '',
  CONFIRMED_NONE: '',
  NO_RETURN: 'Não informado pela fonte: a consulta foi feita e respondeu sem este dado. Isso não equivale a “nada consta”.',
  UNAVAILABLE: 'Não informado pela fonte: esta base não respondeu (indisponibilidade, recusa ou falta de tempo). Isso não equivale a “nada consta”.',
  OUT_OF_SCOPE: 'Não informado nesta consulta: a base que verifica este item não foi acionada nesta consulta. Isso não equivale a “nada consta”.'
};

/** A fonte avisando que a consulta em si não se completou (E5). */
const UNAVAILABLE_TEXT = /^(ERRO|FALHA|TIMEOUT|INDISPONIVEL|LIMI(TE|T)|QUOTA|SALDO|RECUSAD|NAO AUTORIZAD|NAO PERMITID|SEM TEMPO|SEM CREDENCI)/;
/** A fonte respondeu, mas não informou este dado (E3): "não sei" nunca é "não há". */
const NO_RETURN_TEXT = /^(NAO INFORMAD|NAO DISPONIVEL|NAO DISPONIBILIZAD|NAO LOCALIZAD|NAO FOI POSSIVEL|NAO CONSEGU|NAO IDENTIFICAD|NAO CADASTRAD|INDEFINID|INCONCLUS|EM ANDAMENTO|CONSULTA EM ANDAMENTO|AGUARDE|SEM RETORNO|SEM DADOS|SEM INFORMAC|SEM RESPOSTA|PLACA SEM CADASTRO|RESPOSTA PARCIAL|N\/?D|N\/?A|NULL|-+)$/;
/** Ausência afirmada pela fonte (E2), incluindo as respostas negativas documentadas dos campos de código (N, 0). */
const CONFIRMED_NONE_TEXT = /^(NADA CONSTA|NADA CONS|NAO CONSTA|NAO POSSUI|NAO HA|NAO EXISTE|NAO TEM|NAO (FOI )?APRESENTAD|SEM (?!INFORMAC|RETORNO|DADOS|RESPOSTA)|N|NAO|NADA|NENHUM|NENHUMA|FALSE|0+)$/;
/** Ocorrência afirmada pela fonte (E1), incluindo as respostas afirmativas dos campos de código (S, 1, 2...). */
const OCCURRENCE_TEXT = /^(S|SIM|TRUE|[1-9]\d*)$|REGISTRO|OCORRENCIA|CONSTA|EXISTE|POSSUI|LOCALIZADO|ALIENAC|APREENS|BLOQUE|RESTRICAO|LEILAO|SINISTRO|ROUBO|FURTO|RECALL|CAMPANHA|IRREGULAR|REMARCA|DENUNCIA|INQUERITO|GUINCHO|TRIBUTARI|ADMINISTRATIV|JUDICIAL|PENDENCIA|VENCID|ATIVA|EM ABERTO|INATIV|DESMONT|SUCATA|MULTA|DEBITO|BUSCA/;

/** Estado de um texto devolvido pela fonte. `undefined` = texto que ninguém pode interpretar como ausência. */
export function classifyText(value: unknown): SourceState | undefined {
  const t = fold(scalar(value));
  if (!t) return undefined;
  if (UNAVAILABLE_TEXT.test(t)) return 'UNAVAILABLE';
  if (NO_RETURN_TEXT.test(t)) return 'NO_RETURN';
  if (CONFIRMED_NONE_TEXT.test(t)) return 'CONFIRMED_NONE';
  if (OCCURRENCE_TEXT.test(t)) return 'OCCURRENCE';
  return undefined;
}

/** Estado de uma peça que não veio como dados: sem código é fora da cobertura; com código é a base que não respondeu. */
export const missingPieceState = (piece: Piece): SourceState => (piece.kind === 'none' ? (piece.code ? 'UNAVAILABLE' : 'OUT_OF_SCOPE') : piece.kind === 'notFound' ? 'CONFIRMED_NONE' : 'NO_RETURN');
/** Linha legível do estado (vazia para E1/E2, que se mostram com o texto da própria fonte). */
export const stateLine = (state: SourceState | undefined): string | undefined => (state && state !== 'OCCURRENCE' && state !== 'CONFIRMED_NONE' ? STATE_LINE[state] : undefined);

/** Nome do bloco de controle que grava o estado de cada camada no envelope em camadas. */
export const LAYER_STATE_KEY = 'ESTADO_CONSULTA';
export type LayerStates = Partial<Record<LayerBlock | 'RENAINF', SourceState>>;

/** Lê os estados por camada gravados por `buildLayeredEnvelope` (vazio no pacote Veículo Total, que não passa por aqui). */
export function layerStatesOf(resposta: Rec | null | undefined): LayerStates {
  if (!resposta || !isRec(resposta[LAYER_STATE_KEY])) return {};
  const up = upperKeys(resposta[LAYER_STATE_KEY] as Rec);
  const out: Rec = {};
  for (const [k, v] of Object.entries(up)) if ((SOURCE_STATES as readonly string[]).includes(String(v))) out[k] = String(v);
  return out as LayerStates;
}

/** RESPOSTA do envelope guardado ({ placa, data: envelope }), com as chaves em maiúsculas. */
export function respostaOf(raw: unknown, depth = 0): Rec | null {
  if (!isRec(raw) || depth > 4) return null;
  for (const [k, v] of Object.entries(raw)) if (k.toUpperCase() === 'RESPOSTA' && isRec(v)) return upperKeys(v);
  for (const v of Object.values(raw)) { const f = respostaOf(v, depth + 1); if (f) return f; }
  return null;
}

/**
 * Forma que a documentação da Credify publica para o recall: CODIGO e o bloco da consulta dentro de CONSULTA, sem RESPOSTA.
 * Devolve a resposta no formato padrão (CONSULTA só com os metadados; RESPOSTA com CODIGO e o bloco). Só vale se houver CODIGO e algum bloco.
 */
export function consultaComoResposta(raw: unknown): Rec | null {
  if (!isRec(raw)) return null;
  const entry = Object.entries(raw).find(([k, v]) => k.toUpperCase() === 'CONSULTA' && isRec(v));
  if (!entry) return null;
  const up = upperKeys(entry[1] as Rec);
  const hasCode = up.CODIGO !== undefined && String(up.CODIGO).trim() !== '';
  const hasBlock = Object.entries(up).some(([k, v]) => !CONTROL_KEYS.test(k) && isRec(v));
  if (!hasCode || !hasBlock) return null;
  const meta: Rec = {};
  const resposta: Rec = {};
  for (const [k, v] of Object.entries(up)) (/^(CODIGORESPOSTA|DATAHORA|LOGON|IDCONSULTA)$/.test(k) ? meta : resposta)[k] = v;
  return { ...raw, CONSULTA: meta, RESPOSTA: resposta };
}

/** Texto do marcador do cadastro (RETORNO do BDRP) para roubo/furto e recall. */
export function bdrpReturn(raw: unknown): Rec {
  const r = respostaOf(raw);
  const bdrp = r && isRec(r.VEICULOSBDRP) ? upperKeys(r.VEICULOSBDRP as Rec) : undefined;
  return bdrp && isRec(bdrp.RETORNO) ? upperKeys(bdrp.RETORNO as Rec) : {};
}

/**
 * "Limpo" só quando o marcador diz com todas as letras que não há ocorrência (E2).
 * "NÃO INFORMADO", "NÃO DISPONÍVEL", "NÃO LOCALIZADO", vazio ou texto desconhecido NÃO são limpos: são E3/E5 e por isso
 * continuam comprando a consulta complementar (roubo/furto e recall), em vez de virar "nada consta" no relatório.
 */
export function flagIsClear(value: unknown): boolean {
  return classifyText(value) === 'CONFIRMED_NONE';
}
export const flagText = (value: unknown): string => scalar(value);

/** Semáforo do Farol Leilão: 1 verde, 2 amarelo, 3 vermelho. Aceita REGISTRO_1 aninhado ou campos na raiz. */
export interface Farol { level: 'GREEN' | 'YELLOW' | 'RED'; parecer: 1 | 2 | 3; semaforo: string }
export function parseFarol(resposta: unknown): Farol | undefined {
  const find = (o: unknown, key: string, depth = 0): string => {
    if (!isRec(o) || depth > 5) return '';
    for (const [k, v] of Object.entries(o)) if (k.toUpperCase() === key && !isRec(v) && !Array.isArray(v)) return scalar(v);
    for (const v of Object.values(o)) { const f = find(v, key, depth + 1); if (f) return f; }
    return '';
  };
  const parecer = Number(find(resposta, 'PARECERTECNICO'));
  const sem = fold(find(resposta, 'SEMAFORO'));
  const byParecer = parecer === 1 ? 'GREEN' : parecer === 2 ? 'YELLOW' : parecer === 3 ? 'RED' : undefined;
  const bySem = /VERDE/.test(sem) ? 'GREEN' : /AMARELO/.test(sem) ? 'YELLOW' : /VERMELH/.test(sem) ? 'RED' : undefined;
  const level = byParecer ?? bySem;
  if (!level) return undefined;
  const p = (level === 'GREEN' ? 1 : level === 'YELLOW' ? 2 : 3) as 1 | 2 | 3;
  return { level, parecer: p, semaforo: level === 'GREEN' ? 'VERDE' : level === 'YELLOW' ? 'AMARELO' : 'VERMELHO' };
}
export const FAROL_TEXT: Record<Farol['level'], string> = { GREEN: 'parecer favorável, sem restrições', YELLOW: 'restrição discreta ou pequena', RED: 'restrições graves' };

/** RESPOSTA de uma consulta avulsa sem os campos de controle: vira o "bloco" do Veículo Total. */
function blockFrom(resposta: Rec): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(resposta)) if (!/^(CODIGO|MSG|MSG_ERRO)$/i.test(k)) out[k.toUpperCase()] = v;
  return out;
}

/** Texto posto no lugar do bloco quando a própria fonte respondeu "dado não encontrado nesta base" (E2). */
export const NOT_PRESENTED: Partial<Record<LayerBlock, string>> = {
  LEILAOCONJUGADO: 'O VEICULO NAO FOI APRESENTADO NA BASE DE LEILAO.',
  HISTORICOROUBOFURTO: 'O VEICULO NAO FOI APRESENTADO NO HISTORICO DE ROUBO OU FURTO.',
  RECALL: 'NAO FOI POSSIVEL LOCALIZAR O VEICULO.'
};

export interface LayerInput {
  consulta?: unknown;
  /** Resposta da consulta base (Débitos, Restrições e Proprietários): precisa ter o VEICULOSBDRP. */
  baseRaw: unknown;
  sinistro: Piece;
  recall: Piece;
  /** O marcador do cadastro já bastou para roubo/furto e recall (nenhuma chamada extra). */
  recallFromFlag?: string;
  theft: Piece;
  theftFromFlag?: string;
  leilao: Piece;
  farol?: Farol;
  national: Piece;
  /** Histórico de proprietários (consulta própria da Credify); sem ela o bloco fica como "não consultado". */
  owners?: Piece;
  /** FIPE pela placa (consulta própria da Credify); sem ela o bloco fica como "não consultado". */
  fipe?: Piece;
  /** Proprietário pela placa (consulta própria da Credify): completa nome e documentos que a base não trouxe. */
  ownerPlate?: Piece;
  /** Infrações (RENAINF): multas detalhadas. Vai fora do vetor de blocos do Veículo Total. */
  renainf?: Piece;
}

/** Nomes sob os quais a Credify publica o bloco de cada consulta avulsa (a documentação traz mais de um para a mesma consulta). */
const BLOCK_ALIASES: Partial<Record<LayerBlock, string[]>> = {
  VEICULARBNACIONAL: ['VEICULARBNACIONAL', 'VEICULARBNACIONALONLINE', 'RENAVAMONLINE'],
  INDICIOSINISTROVEICULAR: ['INDICIOSINISTROVEICULAR', 'INDICIOSINISTRO']
};
const CONTROL_KEYS = /^(CONSULTA|CODIGO|MSG|MSG_ERRO|DESCRICAORETORNO)$/;

/**
 * A documentação mostra algumas consultas com os campos dentro de um bloco (ex.: RESPOSTA.INDICIOSINISTROVEICULAR, RESPOSTA.VEICULARBNACIONALONLINE); outras vêm direto.
 * Aceita as duas formas e os nomes alternativos do bloco. Se o bloco tiver outro nome, mas for o único objeto da resposta, também é ele.
 */
function unwrap(name: LayerBlock, resposta: Rec): Rec {
  const up = upperKeys(resposta);
  for (const alias of BLOCK_ALIASES[name] ?? [name]) if (isRec(up[alias])) return upperKeys(up[alias]);
  const objects = Object.entries(up).filter(([k, v]) => !CONTROL_KEYS.test(k) && isRec(v));
  const scalars = Object.entries(up).filter(([k, v]) => !CONTROL_KEYS.test(k) && !isRec(v));
  if (objects.length === 1 && !scalars.length && !/^REGISTRO_\d+$/.test(objects[0]![0])) return upperKeys(objects[0]![1] as Rec);
  return resposta;
}

/** A peça de dados chegou, mas sem nenhum campo além dos de controle: a Credify respondeu "ok" sem entregar o que foi pago. */
export function pieceIsEmpty(name: LayerBlock, resposta: Rec): boolean {
  const inner = unwrap(name, resposta);
  return !Object.entries(inner).some(([k, v]) => !CONTROL_KEYS.test(k) && v !== null && v !== undefined && (typeof v === 'object' || String(v).trim() !== ''));
}

/** Peça → [código do bloco, bloco, estado]. "Sem peça" vira código 3 e o bloco fica ausente, com o estado de por quê. */
function slot(name: LayerBlock, piece: Piece, flag?: string): { code: string; block?: Rec; state: SourceState } {
  // Marcador do cadastro no lugar da consulta: o estado vem do próprio texto (E2 quando afirma ausência, E3 quando não afirma).
  if (flag !== undefined) return { code: '1', block: { DESCRICAORETORNO: flag }, state: classifyText(flag) ?? 'NO_RETURN' };
  if (piece.kind === 'data') {
    const resposta = unwrap(name, piece.resposta);
    const block = name === 'VEICULARBNACIONAL' ? nationalBlock(resposta) : blockFrom(resposta);
    const state: SourceState = pieceIsEmpty(name, piece.resposta) ? 'NO_RETURN' : classifyText(block.DESCRICAORETORNO) ?? 'OCCURRENCE';
    return { code: '1', block, state };
  }
  // notFound só chega aqui quando a própria consulta respondeu CODIGO=2 ("dado não encontrado nesta base"): E2.
  // HTTP 404/410 (endpoint fora do contrato) cai em `kind:'none'` com código, portanto E5 — nunca "nada consta".
  if (piece.kind === 'notFound') return { code: '2', block: { DESCRICAORETORNO: NOT_PRESENTED[name] ?? 'DADO NAO ENCONTRADO NA BASE CONSULTADA' }, state: 'CONFIRMED_NONE' };
  return { code: '3', state: missingPieceState(piece) };
}

/** A consulta de infrações pode vir direto ou dentro de RESPOSTA.RENAINF. */
function unwrapRenainf(resposta: Rec): Rec {
  const inner = upperKeys(resposta).RENAINF;
  return isRec(inner) ? { ...upperKeys(resposta), ...upperKeys(inner) } : resposta;
}
function renainfBlock(resposta: Rec): Rec { return blockFrom(resposta); }

/** A base nacional sai do bloco simples da consulta avulsa como REGISTRO_1, que é o formato do Veículo Total. */
function nationalBlock(resposta: Rec): Rec {
  const up = upperKeys(resposta);
  if (Object.keys(up).some((k) => /^REGISTRO_\d+$/.test(k))) return blockFrom(up);
  return { DESCRICAORETORNO: scalar(up.DESCRICAORETORNO) || 'SUCESSO', REGISTRO_1: blockFrom(up) };
}

const isZeroDoc = (v: string): boolean => !/[1-9]/.test(v.replace(/\D/g, ''));
/** Campo do proprietário na consulta base ← campo da consulta "Proprietário pela placa". */
const OWNER_PLATE_FIELDS: ReadonlyArray<readonly [string, string, boolean]> = [
  ['PRONOME', 'NOME_PROPRIETARIO', false],
  ['CPF_CNPJ_PROPRIETARIO', 'NUMERO_DOCUMENTO_PROPRIETARIO', true],
  ['TIPODOCUMENTOPROPRIETARIO', 'TIPO_DOCUMENTO_PROPRIETARIO', false],
  ['CPFCNPJFATURADO', 'NUMERO_IDENTIFICACAO_FATURADO', true],
  ['TIPODOCUMENTOFATURADO', 'TIPO_DOCUMENTO_FATURADO', false]
];
/** Completa o cadastro da base com o proprietário pela placa, só onde a base veio vazia (ou com documento de zeros). Nunca troca um dado que a base trouxe. */
export function mergeOwnerPlate(bdrp: Rec, piece: Piece | undefined): Rec {
  if (!piece || piece.kind !== 'data' || !isRec(bdrp.RETORNO)) return bdrp;
  const up = upperKeys(piece.resposta);
  const src = isRec(up.VEICULOPROPRIETARIOPLACA) ? upperKeys(up.VEICULOPROPRIETARIOPLACA as Rec) : up;
  const retorno: Rec = { ...(bdrp.RETORNO as Rec) };
  for (const [target, from, isDoc] of OWNER_PLATE_FIELDS) {
    const incoming = scalar(src[from]);
    if (!incoming || (isDoc && isZeroDoc(incoming))) continue;
    const key = Object.keys(retorno).find((k) => k.toUpperCase() === target) ?? target;
    const current = scalar(retorno[key]);
    if (current && !(isDoc && isZeroDoc(current))) continue;
    retorno[key] = incoming;
  }
  return { ...bdrp, RETORNO: retorno };
}

/** Monta o envelope no formato do Veículo Total. Os blocos não comprados (proprietários, FIPE) ficam como "não consultado". */
export function buildLayeredEnvelope(input: LayerInput): Rec {
  const base = respostaOf(input.baseRaw);
  const bdrpBase = base && isRec(base.VEICULOSBDRP) ? (base.VEICULOSBDRP as Rec) : undefined;
  if (!bdrpBase) throw new Error('Consulta base sem VEICULOSBDRP');
  const bdrp = mergeOwnerPlate(bdrpBase, input.ownerPlate);
  const pieces: Record<LayerBlock, { code: string; block?: Rec; state: SourceState }> = {
    INDICIOSINISTROVEICULAR: input.sinistro.kind === 'notFound' ? { code: '2', state: 'CONFIRMED_NONE' } : slot('INDICIOSINISTROVEICULAR', input.sinistro),
    RECALL: slot('RECALL', input.recall, input.recallFromFlag),
    HISTORICOROUBOFURTO: slot('HISTORICOROUBOFURTO', input.theft, input.theftFromFlag),
    LEILAOCONJUGADO: input.leilao.kind === 'none' ? { code: input.farol ? '2' : '3', state: input.farol ? missingPieceState(input.leilao) : missingPieceState(input.leilao) } : slot('LEILAOCONJUGADO', input.leilao),
    HISTORICOPROPRIETARIO: input.owners && input.owners.kind !== 'none' ? slot('HISTORICOPROPRIETARIO', input.owners) : { code: '3', state: missingPieceState(input.owners ?? { kind: 'none' }) },
    VEICULARBNACIONAL: slot('VEICULARBNACIONAL', input.national),
    PRECIFICADORFIPE: input.fipe && input.fipe.kind !== 'none' ? slot('PRECIFICADORFIPE', input.fipe) : { code: '3', state: missingPieceState(input.fipe ?? { kind: 'none' }) },
    VEICULOSBDRP: { code: '1', block: bdrp, state: 'OCCURRENCE' }
  };
  const resposta: Rec = { CODIGO: LAYER_ORDER.map((n) => pieces[n].code) };
  for (const n of LAYER_ORDER) if (pieces[n].block) resposta[n] = pieces[n].block;
  // Estado de cada consulta (E1..E5): é o que permite a um campo sem dado dizer POR QUE não tem dado, em vez de sumir do relatório.
  const states: Rec = {};
  for (const n of LAYER_ORDER) states[n] = pieces[n].state;
  if (input.renainf?.kind === 'data') {
    resposta.RENAINF = renainfBlock(unwrapRenainf(input.renainf.resposta));
    states.RENAINF = pieceIsEmpty('VEICULOSBDRP', input.renainf.resposta) ? 'NO_RETURN' : 'OCCURRENCE';
  } else states.RENAINF = missingPieceState(input.renainf ?? { kind: 'none' });
  resposta[LAYER_STATE_KEY] = states;
  if (input.farol) resposta.FAROLLEILAO = { PARECERTECNICO: String(input.farol.parecer), SEMAFORO: input.farol.semaforo };
  const origem: Rec = {};
  if (input.theftFromFlag !== undefined) origem.ROUBOFURTO = 'CADASTRO';
  if (input.recallFromFlag !== undefined) origem.RECALL = 'CADASTRO';
  if (Object.keys(origem).length) resposta.ORIGEM = origem;
  return { CONSULTA: isRec(input.consulta) ? input.consulta : {}, RESPOSTA: resposta };
}

/** Controle de custo de uma consulta: custo de cada caminho e teto vêm das variáveis (nenhum valor no código). */
export class Spend {
  private spent = 0;
  private readonly calls: string[] = [];
  private readonly costs: Record<string, number> | undefined;
  constructor(private readonly budgetCents: number | undefined, costs: Record<string, number> | undefined) {
    this.costs = costs ? Object.fromEntries(Object.entries(costs).map(([k, v]) => [k.toLowerCase(), v])) : undefined;
  }
  private allowed: Set<string> | undefined;
  /** Cerca do contrato: com a lista definida, qualquer chamada fora dela é barrada antes de sair. */
  fence(paths: Iterable<string>): void { this.allowed = new Set([...paths].map((p) => p.toLowerCase())); }
  assertAllowed(path: string): void {
    if (this.allowed && !this.allowed.has(path.toLowerCase())) throw Object.assign(new Error('PRODUCT_CONTRACT_VIOLATION'), { code: 'PRODUCT_CONTRACT_VIOLATION', detail: path });
  }
  /** Chamadas essenciais sempre acontecem e contam para o teto das opcionais. */
  record(path: string): void { this.spent += this.costs?.[path.toLowerCase()] ?? 0; this.calls.push(path); }
  /** Opcional: sem teto (ou sem custo informado) libera; com teto, só libera se couber. */
  allow(path: string): boolean {
    if (this.budgetCents === undefined) return true;
    const cost = this.costs?.[path.toLowerCase()];
    if (cost === undefined) return true;
    return this.spent + cost <= this.budgetCents;
  }
  get paths(): readonly string[] { return this.calls; }
}
