export const packageName = '@socio/db' as const;

export { createServerClient, createServiceClient, type DbClient } from './clients';
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Views } from './database.types';
