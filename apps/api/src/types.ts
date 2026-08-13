export type NormalizedVehicle = {
  identification: { plate:string; renavam?:string; chassis?:string; engine?:string; gearbox?:string; brand?:string; model?:string; fullModel?:string };
  characteristics: { manufactureYear?:string; modelYear?:string; color?:string; fuel?:string; power?:string; displacement?:string; type?:string; species?:string; category?:string; body?:string; axles?:string; passengers?:string; loadCapacity?:string; origin?:string };
  registration: { city?:string; state?:string; licensingDate?:string; licensingYear?:string; status?:string };
  owner: { name?:string; document?:string; documentType?:string };
  debts: { key:string; label:string; amountCents:number; hasDebt:boolean }[];
  restrictions: { key:string; label:string; status:string; alert:boolean }[];
  recall?:string;
};

export interface VehicleDataProvider {
  name: string;
  queryByPlate(plate: string): Promise<{ providerQueryId?: string; raw: unknown }>;
}
