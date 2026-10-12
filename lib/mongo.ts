import { MongoClient, type Document } from "mongodb";
import { env, envOptional } from "./env";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClient?: MongoClient;
  mongoReady?: Promise<void>;
};

export function getClient(): MongoClient {
  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(env("MONGODB_URI"));
  }
  return globalForMongo.mongoClient;
}

export async function getDb() {
  const client = getClient();
  await client.connect();
  return client.db(envOptional("MONGODB_DB") ?? "nse_breakout");
}

export async function collection<T extends Document>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  await db.collection("instruments").createIndex({ instrument_token: 1 }, { unique: true });
  await db.collection("instruments").createIndex({ tradingsymbol: 1 });
  await db.collection("daily_bars").createIndex(
    { instrument_token: 1, date: 1 },
    { unique: true },
  );
  await db.collection("candles_5m").createIndex(
    { instrument_token: 1, date: 1 },
    { unique: true },
  );
  await db.collection("signals").createIndex(
    { instrument_token: 1, date: 1, side: 1 },
    { unique: true },
  );
  await db.collection("quotes").createIndex({ instrument_token: 1 }, { unique: true });
  await db.collection("kite_sessions").createIndex({ login_date: 1, login_time: -1 });
  await db.collection("jobs").createIndex({ status: 1, createdAt: 1 });
  await db.collection("coverage").createIndex(
    { instrument_token: 1, interval: 1, date: 1 },
    { unique: true },
  );
  await db.collection("notices").createIndex({ createdAt: 1 });
  await db.collection("indices").createIndex({ symbol: 1 }, { unique: true });
  await db.collection("stocks").createIndex({ instrument_token: 1 }, { unique: true });
  await db.collection("picks").createIndex({ instrument_token: 1 }, { unique: true });
  await db.collection("pie_picks").createIndex({ symbol: 1 }, { unique: true });
  await db.collection("index_members").createIndex(
    { symbol: 1, instrument_token: 1 },
    { unique: true },
  );
  await db.collection("index_members").createIndex({ instrument_token: 1 });
}

export function readyDb(): Promise<void> {
  if (!globalForMongo.mongoReady) {
    globalForMongo.mongoReady = ensureIndexes();
  }
  return globalForMongo.mongoReady;
}
