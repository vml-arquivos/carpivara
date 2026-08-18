const cents = (v) => {
    if (typeof v !== 'string' && typeof v !== 'number')
        return 0;
    const s = String(v).trim();
    if (!s)
        return 0;
    const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const text = (v) => Array.isArray(v) ? (v[0] ?? undefined) : (v == null ? '' : String(v).trim()) || undefined;
const ok = (v) => !text(v) || /NADA CONSTA|NAO POSSUI|NÃO POSSUI|OK|NAO EXISTE/i.test(text(v));
export function normalizeBdrp(raw) {
    const r = raw?.RESPOSTA?.VEICULOSBDRP?.RETORNO;
    if (!r || raw?.RESPOSTA?.CODIGO !== '1')
        throw new Error('Resposta do provedor inválida');
    return {
        identification: { plate: text(r.PLACA), renavam: text(r.RENAVAM), chassis: text(r.CHASSI), engine: text(r.MOTOR), gearbox: text(r.NUMERO_CAIXACAMBIO), brand: text(r.MARCA), model: text(r.MODELO), fullModel: text(r.MARCAMODELOCOMPLETO) },
        characteristics: { manufactureYear: text(r.VEIANOFABR), modelYear: text(r.VEIANOMODELO), color: text(r.COR), fuel: text(r.COMBUSTIVEL), power: text(r.POTENCIA), displacement: text(r.CILINDRADA), type: text(r.TIPO), species: text(r.ESPECIE), category: text(r.VEICATEGORIA), body: text(r.CARROCERIA), axles: text(r.EIXOS), passengers: text(r.CAPACIDADEPASSAG), loadCapacity: text(r.CAPACIDADECARGA), origin: text(r.VEIPROCEDENCIA) },
        registration: { city: text(r.MUNICIPIO), state: text(r.UF), licensingDate: text(r.LICDATA), licensingYear: text(r.LICEXELIC), status: text(r.SITUACAOVEICULO) },
        owner: { name: text(r.PRONOME), document: text(r.CPF_CNPJ_PROPRIETARIO), documentType: text(r.TIPODOCUMENTOPROPRIETARIO) },
        debts: [
            ['MULTAS', 'Multas', r.VALORTOTALDEBITOMULTA], ['LICENCIAMENTO', 'Licenciamento', r.EXISTEDEBITODELICENCIAMENTOVL], ['IPVA', 'IPVA', r.DEBIPVA], ['DETRAN', 'DETRAN', r.DEBDETRAN], ['DER', 'DER', r.DEBDER], ['PRF', 'Polícia Rodoviária Federal', r.DEBPOLRODFED], ['RENAINF', 'RENAINF', r.DEBRENAINF], ['MUNICIPAIS', 'Débitos municipais', r.DEBMUNICIPAIS]
        ].map(([key, label, value]) => ({ key: String(key), label: String(label), amountCents: cents(value), hasDebt: cents(value) > 0 })),
        restrictions: [
            ['FURTO', 'Furto/Roubo', r.RESFURTO], ['JUDICIAL', 'Judicial', r.RESJUDICIAL], ['RENAJUD', 'RENAJUD', r.RESRENAJUD], ['ADMIN', 'Administrativa', r.RESADMINISTRATIVA], ['TRIBUTARIA', 'Tributária', r.RESTRIBUTARIA], ['FINANCEIRA', 'Financeira', r.RESTRICAOFINAN], ['RFB', 'Receita Federal', r.RESTRICAORFB], ['AMBIENTAL', 'Ambiental', r.RESAMBIENTAL]
        ].map(([key, label, status]) => ({ key: String(key), label: String(label), status: text(status) ?? 'SEM INFORMACAO', alert: !ok(status) })),
        recall: text(r.RECALL)
    };
}
export function normalizeFipe(raw) {
    const price = typeof raw?.price === 'string' ? raw.price : typeof raw?.valor === 'string' ? raw.valor : raw?.price;
    const normalizedPrice = String(price ?? '').trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
    const value = Number(normalizedPrice);
    if (!raw || !Number.isFinite(value) || value <= 0)
        throw new Error('FIPE_INVALID_RESPONSE');
    const vehicleType = raw.vehicleType === 2 || raw.tipoVeiculo === 2 || raw.tipoVeiculo === '2' ? 'motorcycles' : raw.vehicleType === 3 || raw.tipoVeiculo === 3 || raw.tipoVeiculo === '3' ? 'trucks' : 'cars';
    const brand = { code: String(raw.brandCode ?? raw.codigoMarca ?? raw.marcaCodigo ?? ''), name: String(raw.brand ?? raw.marca ?? '').trim() };
    const model = { code: String(raw.modelCode ?? raw.codigoModelo ?? raw.modeloCodigo ?? ''), name: String(raw.model ?? raw.modelo ?? '').trim() };
    const year = { code: String(raw.yearCode ?? raw.codigoAno ?? raw.anoCodigo ?? ''), name: String(raw.year ?? raw.ano ?? raw.modelYear ?? raw.anoModelo ?? '').trim() };
    if (!brand.name || !model.name || !year.name || !String(raw.codeFipe ?? raw.codigoFipe ?? raw.codigoFipe).trim())
        throw new Error('FIPE_INVALID_RESPONSE');
    const referenceMonth = String(raw.referenceMonth ?? raw.mesReferencia ?? raw.referencia ?? '').trim();
    if (!referenceMonth)
        throw new Error('FIPE_REFERENCE_MISSING');
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
