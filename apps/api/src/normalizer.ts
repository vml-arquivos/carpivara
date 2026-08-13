import type { NormalizedVehicle } from './types.js';

const cents=(v:unknown)=>{
  if (typeof v !== 'string' && typeof v !== 'number') return 0;
  const s=String(v).trim();
  if (!s) return 0;
  const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.') : s;
  const n=Number(normalized);
  return Number.isFinite(n)?Math.round(n*100):0;
};
const text=(v:unknown)=>Array.isArray(v)?(v[0]??undefined):(v==null?'':String(v).trim()) || undefined;
const ok=(v:unknown)=>!text(v) || /NADA CONSTA|NAO POSSUI|NÃO POSSUI|OK|NAO EXISTE/i.test(text(v)!);

export function normalizeBdrp(raw:any): NormalizedVehicle {
  const r=raw?.RESPOSTA?.VEICULOSBDRP?.RETORNO;
  if (!r || raw?.RESPOSTA?.CODIGO !== '1') throw new Error('Resposta do provedor inválida');
  return {
    identification:{plate:text(r.PLACA)!,renavam:text(r.RENAVAM),chassis:text(r.CHASSI),engine:text(r.MOTOR),gearbox:text(r.NUMERO_CAIXACAMBIO),brand:text(r.MARCA),model:text(r.MODELO),fullModel:text(r.MARCAMODELOCOMPLETO)},
    characteristics:{manufactureYear:text(r.VEIANOFABR),modelYear:text(r.VEIANOMODELO),color:text(r.COR),fuel:text(r.COMBUSTIVEL),power:text(r.POTENCIA),displacement:text(r.CILINDRADA),type:text(r.TIPO),species:text(r.ESPECIE),category:text(r.VEICATEGORIA),body:text(r.CARROCERIA),axles:text(r.EIXOS),passengers:text(r.CAPACIDADEPASSAG),loadCapacity:text(r.CAPACIDADECARGA),origin:text(r.VEIPROCEDENCIA)},
    registration:{city:text(r.MUNICIPIO),state:text(r.UF),licensingDate:text(r.LICDATA),licensingYear:text(r.LICEXELIC),status:text(r.SITUACAOVEICULO)},
    owner:{name:text(r.PRONOME),document:text(r.CPF_CNPJ_PROPRIETARIO),documentType:text(r.TIPODOCUMENTOPROPRIETARIO)},
    debts:[
      ['MULTAS','Multas',r.VALORTOTALDEBITOMULTA],['LICENCIAMENTO','Licenciamento',r.EXISTEDEBITODELICENCIAMENTOVL],['IPVA','IPVA',r.DEBIPVA],['DETRAN','DETRAN',r.DEBDETRAN],['DER','DER',r.DEBDER],['PRF','Polícia Rodoviária Federal',r.DEBPOLRODFED],['RENAINF','RENAINF',r.DEBRENAINF],['MUNICIPAIS','Débitos municipais',r.DEBMUNICIPAIS]
    ].map(([key,label,value])=>({key:String(key),label:String(label),amountCents:cents(value),hasDebt:cents(value)>0})),
    restrictions:[
      ['FURTO','Furto/Roubo',r.RESFURTO],['JUDICIAL','Judicial',r.RESJUDICIAL],['RENAJUD','RENAJUD',r.RESRENAJUD],['ADMIN','Administrativa',r.RESADMINISTRATIVA],['TRIBUTARIA','Tributária',r.RESTRIBUTARIA],['FINANCEIRA','Financeira',r.RESTRICAOFINAN],['RFB','Receita Federal',r.RESTRICAORFB],['AMBIENTAL','Ambiental',r.RESAMBIENTAL]
    ].map(([key,label,status])=>({key:String(key),label:String(label),status:text(status)??'SEM INFORMACAO',alert:!ok(status)})),
    recall:text(r.RECALL)
  };
}
