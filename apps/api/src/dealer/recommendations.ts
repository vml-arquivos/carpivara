import { pool } from '../db.js';
import type { ReportV2 } from '../report/normalizeV2.js';

const accents = 'áàãâäéèêëíìîïóòõôöúùûüçñ';
const ascii =   'aaaaaeeeeiiiiooooouuuucn';
const matchKey = (value: string) => value.toLowerCase().normalize('NFD')
  .replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Both arguments to this helper are static column names, never request input.
const stockKey = (column: 'v.brand' | 'v.model') =>
  `trim(regexp_replace(translate(lower(${column}), '${accents}', '${ascii}'), '[^a-z0-9]+', ' ', 'g'))`;

export async function findSimilarListings(headline: ReportV2['headline'], excludedPlate: string) {
  const brand = matchKey(headline.brand ?? '');
  const rawModel = matchKey(headline.model ?? '');
  const model = rawModel.startsWith(brand + ' ') ? rawModel.slice(brand.length + 1) : rawModel;
  if (!brand || !model || model === brand || ['nao informado', 'nao identificado', 'outros', 'ignorado'].includes(model)) return [];

  const year = Number(headline.modelYear ?? headline.manufactureYear);
  const modelYear = Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
  const r = await pool.query(`SELECT v.id, v.brand, v.model, v.version, v.year_model AS "yearModel",
      v.price_cents AS "priceCents", d.name AS "storeName", d.slug AS "storeSlug", d.city, d.state
    FROM stock_vehicles v JOIN dealerships d ON d.id=v.dealership_id
    WHERE d.public_enabled AND d.active AND d.archived_at IS NULL
      AND v.public_listed AND v.status='AVAILABLE' AND v.price_cents > 0
      AND v.plate IS DISTINCT FROM $4::text
      AND ${stockKey('v.brand')} = $1 AND ${stockKey('v.model')} IN ($2, $1 || ' ' || $2)
    ORDER BY abs(coalesce(v.year_model, v.year_manufacture) - $3::int) NULLS LAST, v.created_at DESC, v.id
    LIMIT 6`, [brand, model, modelYear, excludedPlate.toUpperCase().replace(/[^A-Z0-9]/g, '')]);
  return r.rows.map((row) => ({ ...row, priceCents: Number(row.priceCents) }));
}
