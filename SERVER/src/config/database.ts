import { Db, MongoClient } from 'mongodb';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  client = new MongoClient(env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    promoteBuffers: true,
  });
  await client.connect();
  db = client.db(env.MONGO_DB_NAME);

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('otp_codes').createIndex({ email: 1 });
  await db.collection('otp_codes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await db.collection('stations').createIndex({ slug: 1 }, { unique: true });
  await db.collection('stations').createIndex({ ownerId: 1, updatedAt: -1 });
  await db.collection('stations').createIndex({ status: 1, publishedAt: -1 });

  await db.
    collection('creator_songs')
    .createIndex({ stationId: 1, ownerId: 1, createdAt: -1 });
  await db.collection('creator_songs').createIndex({ status: 1, createdAt: 1 });
  await db
    .collection('hosts')
    .createIndex({ stationId: 1, ownerId: 1, createdAt: 1 });
  await db
    .collection('host_scripts')
    .createIndex({ stationId: 1, ownerId: 1, createdAt: -1 });
  await db
    .collection('host_scripts')
    .createIndex({ status: 1, createdAt: 1 });
  await db
    .collection('creator_preferences')
    .createIndex({ stationId: 1, ownerId: 1 }, { unique: true });
  await db
    .collection('station_playlists')
    .createIndex({ stationId: 1 }, { unique: true });
  await db
    .collection('auto_generation_jobs')
    .createIndex({ stationId: 1, createdAt: -1 });
  await db
    .collection('auto_generation_jobs')
    .createIndex({ status: 1, createdAt: 1 });
  await db
    .collection('voice_references')
    .createIndex({ source: 1, ownerId: 1, stationId: 1 });
  await db
    .collection('voice_references')
    .createIndex(
      { builtinKey: 1 },
      { unique: true, partialFilterExpression: { builtinKey: { $type: 'string' } } },
    );

  logger.info('database.connected', { database: env.MONGO_DB_NAME });
  return db;
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database has not been connected yet.');
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
