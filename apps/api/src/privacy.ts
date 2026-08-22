import type { NormalizedVehicle } from './types.js';

/**
 * Retorno seguro para clientes finais.
 *
 * O normalizador mantém owner apenas para uso interno/controlado; nenhum
 * identificador nominal ou documental do proprietário deve atravessar as
 * rotas de histórico, consulta ou exportação do cliente.
 */
export function publicVehicleResult(vehicle: NormalizedVehicle): Omit<NormalizedVehicle, 'owner'> {
  const { owner: _owner, ...publicResult } = vehicle;
  return publicResult;
}

/**
 * Remove recursivamente chaves pessoais de payloads configuráveis de relatório.
 * Isso funciona como defesa adicional para produtos criados no painel, sem
 * alterar o resultado normalizado interno armazenado para auditoria.
 */
const privateField = /^(owner|ownername|ownerdocument|ownerdocumenttype|propriet|nomeproprietario|cpfcnpjproprietario|cpf|cnpj|document|address|endereco|street|logradouro|phone|telefone|email)$/i;

export function redactPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPrivateFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !privateField.test(key.replace(/[^A-Za-z0-9]/g, '')))
      .map(([key, child]) => [key, redactPrivateFields(child)])
  );
}
