import { pool } from '../db.js';
export class MockVehicleProvider {
    name = 'mock-bdrp';
    async queryByPlate(plate) {
        const res = await pool.query('SELECT raw_response FROM sandbox_vehicles WHERE plate=$1', [plate]);
        if (!res.rowCount) {
            const error = new Error('PLACA_NAO_ENCONTRADA_SANDBOX');
            error.code = 'NOT_FOUND';
            throw error;
        }
        return { providerQueryId: `MOCK-${Date.now()}`, raw: res.rows[0].raw_response };
    }
}
