import { pool } from '../db.js';
import type { VehicleDataProvider } from '../types.js';

export class MockVehicleProvider implements VehicleDataProvider {
  name='mock-bdrp';
  async queryByPlate(plate:string) {
    const res=await pool.query('SELECT raw_response FROM sandbox_vehicles WHERE plate=$1',[plate]);
    if (!res.rowCount) {
      const error=new Error('PLACA_NAO_ENCONTRADA_SANDBOX');
      (error as any).code='NOT_FOUND';
      throw error;
    }
    return {providerQueryId:`MOCK-${Date.now()}`,raw:res.rows[0].raw_response};
  }
}
