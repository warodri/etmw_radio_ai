import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { VoiceReferenceDocument } from './voice-reference.model.js';

const WITHOUT_AUDIO = { projection: { data: 0 } } as const;

export class VoiceReferenceRepository {
  private collection(): Collection<VoiceReferenceDocument> {
    return getDatabase().collection<VoiceReferenceDocument>('voice_references');
  }

  async listForStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<VoiceReferenceDocument>[]> {
    return this.collection()
      .find(
        {
          $or: [
            { source: 'builtin', ownerId: null, stationId: null },
            { stationId, ownerId, source: 'upload' },
          ],
        },
        WITHOUT_AUDIO,
      )
      .sort({ source: 1, createdAt: 1 })
      .toArray();
  }

  async findAccessible(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<VoiceReferenceDocument> | null> {
    return this.collection().findOne(
      {
        _id: id,
        $or: [
          { source: 'builtin', ownerId: null, stationId: null },
          { stationId, ownerId, source: 'upload' },
        ],
      },
      WITHOUT_AUDIO,
    );
  }

  async findAudio(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<VoiceReferenceDocument> | null> {
    return this.collection().findOne({
      _id: id,
      $or: [
        { source: 'builtin', ownerId: null, stationId: null },
        { stationId, ownerId, source: 'upload' },
      ],
    });
  }

  async create(
    document: VoiceReferenceDocument,
  ): Promise<WithId<VoiceReferenceDocument>> {
    const result = await this.collection().insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async update(
    id: ObjectId,
    fields: Partial<VoiceReferenceDocument>,
  ): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      { $set: { ...fields, updatedAt: new Date() } },
    );
  }

  async deleteByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<void> {
    await this.collection().deleteMany({
      stationId,
      ownerId,
      source: 'upload',
    });
  }

  async upsertBuiltin(
    document: VoiceReferenceDocument,
  ): Promise<WithId<VoiceReferenceDocument>> {
    const result = await this.collection().findOneAndUpdate(
      { builtinKey: document.builtinKey },
      {
        $set: { ...document, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!result) {
      throw new Error('The built-in voice reference could not be saved.');
    }

    return result;
  }
}
