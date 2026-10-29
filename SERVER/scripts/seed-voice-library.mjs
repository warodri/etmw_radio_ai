import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'voice-library');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'etmw_radio_ai';

if (!uri) {
  console.error('MONGO_URI is required. Use node --env-file=.env.production scripts/seed-voice-library.mjs');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection('voice_references');
  const now = new Date();
  let count = 0;

  for (const entry of manifest) {
    const data = await fs.readFile(path.join(root, entry.file));
    const document = {
      builtinKey: `vctk:${entry.speaker_id}`,
      ownerId: null,
      stationId: null,
      name: entry.name,
      description: entry.description,
      gender: entry.gender,
      accent: entry.accent,
      region: entry.region,
      age: entry.age,
      source: 'builtin',
      license: entry.license,
      attribution: entry.attribution,
      sourceUrl: entry.sourceUrl,
      transcript: entry.transcript,
      mimeType: 'audio/wav',
      data,
      durationSeconds: entry.durationSeconds,
      voiceStudioProfileId: null,
      updatedAt: now,
    };

    await collection.updateOne(
      { builtinKey: document.builtinKey },
      { $set: document, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    count += 1;
  }

  await collection.createIndex(
    { builtinKey: 1 },
    { unique: true, partialFilterExpression: { builtinKey: { $type: 'string' } } },
  );

  console.log(`Seeded ${count} built-in voice references into ${dbName}.voice_references`);
} finally {
  await client.close();
}
