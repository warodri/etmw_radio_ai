import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { ScriptDocument } from './script.model.js';

const WITHOUT_AUDIO_DATA = { projection: { 'audio.data': 0 } } as const;

export class ScriptRepository {
  private collection(): Collection<ScriptDocument> {
    return getDatabase().collection<ScriptDocument>('host_scripts');
  }

  async create(document: ScriptDocument): Promise<WithId<ScriptDocument>> {
    const result = await this.collection().insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async listByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
    skip: number,
    limit: number,
  ): Promise<WithId<ScriptDocument>[]> {
    return this.collection()
      .find({ stationId, ownerId }, WITHOUT_AUDIO_DATA)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async countByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<number> {
    return this.collection().countDocuments({ stationId, ownerId });
  }

  async findOwned(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<ScriptDocument> | null> {
    return this.collection().findOne(
      { _id: id, stationId, ownerId },
      WITHOUT_AUDIO_DATA,
    );
  }

  async findById(id: ObjectId): Promise<WithId<ScriptDocument> | null> {
    return this.collection().findOne({ _id: id }, WITHOUT_AUDIO_DATA);
  }

  async findAudio(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<ScriptDocument> | null> {
    return this.collection().findOne(
      { _id: id, stationId, ownerId },
      { projection: { audio: 1, status: 1 } },
    );
  }

  async updateOwned(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
    fields: Partial<ScriptDocument>,
  ): Promise<WithId<ScriptDocument> | null> {
    return this.collection().findOneAndUpdate(
      { _id: id, stationId, ownerId },
      { $set: { ...fields, updatedAt: new Date() } },
      { returnDocument: 'after', ...WITHOUT_AUDIO_DATA },
    );
  }

  async updateById(
    id: ObjectId,
    fields: Partial<ScriptDocument>,
  ): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      { $set: { ...fields, updatedAt: new Date() } },
    );
  }

  async listQueued(limit = 50): Promise<WithId<ScriptDocument>[]> {
    return this.collection()
      .find({ status: 'queued' }, WITHOUT_AUDIO_DATA)
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  async markGeneratingFailed(): Promise<void> {
    await this.collection().updateMany(
      { status: 'generating' },
      {
        $set: {
          status: 'failed',
          error:
            'Generation was interrupted when the server restarted. Please create a new script.',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  async deleteByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<void> {
    await this.collection().deleteMany({ stationId, ownerId });
  }
}
