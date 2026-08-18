import pg, { type PoolConfig } from 'pg'

import { requiredEnvironment } from './environment.js'

const config: PoolConfig = {
  connectionString: requiredEnvironment('DATABASE_URL'),
  max: 10,
}

if (process.env.DATABASE_SSL === 'require') {
  config.ssl = { rejectUnauthorized: false }
}

export const database = new pg.Pool(config)

