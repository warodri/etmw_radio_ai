import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import {
  AutoGenerationJobDocument,
  AutoGenerationStatus,
} from './auto-generation.model.js';

export class AutoGenerationRepository {
  private collection(): Collection<AutoGenerationJobDocument> {
    return getDatabase().collection<AutoGenerationJobDocument>(
      'auto_generation_jobs',
    );
  }

  async create(
    document: AutoGenerationJobDocument,
  ): Promise<WithId<AutoGenerationJobDocument>> {
    const result = await this.collection().insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async findById(
    id: ObjectId,
  ): Promise<WithId<AutoGenerationJobDocument> | null> {
    return this.collection().findOne({ _id: id });
  }

  async findLatestByStation(
    stationId: ObjectId,
  ): Promise<WithId<AutoGenerationJobDocument> | null> {
    return this.collection()
      .find({ stationId })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
  }

  async findActiveByStation(
    stationId: ObjectId,
  ): Promise<WithId<AutoGenerationJobDocument> | null> {
    return this.collection().findOne({
      stationId,
      status: { $in: ['queued', 'running'] },
    });
  }

  async findActive(): Promise<WithId<AutoGenerationJobDocument>[]> {
    return this.collection()
      .find({ status: { $in: ['queued', 'running'] } })
      .toArray();
  }

  async claimNextQueued(): Promise<WithId<AutoGenerationJobDocument> | null> {
    const queued = await this.collection()
      .find({ status: 'queued' })
      .sort({ createdAt: 1 })
      .limit(1)
      .next();

    if (!queued) {
      return null;
    }

    const now = new Date();
    const startedAt = queued.startedAt ?? now;
    const endsAt =
      queued.endsAt ?? new Date(startedAt.getTime() + 60 * 60 * 1000);

    return this.collection().findOneAndUpdate(
      { _id: queued._id, status: 'queued' },
      {
        $set: {
          status: 'running',
          startedAt,
          endsAt,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async resetRunning(): Promise<number> {
    const result = await this.collection().updateMany(
      { status: 'running' },
      { $set: { status: 'queued', updatedAt: new Date() } },
    );
    return result.modifiedCount;
  }

  async update(
    id: ObjectId,
    fields: Partial<AutoGenerationJobDocument>,
  ): Promise<WithId<AutoGenerationJobDocument> | null> {
    return this.collection().findOneAndUpdate(
      { _id: id },
      { $set: { ...fields, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }

  async addSong(id: ObjectId, songId: ObjectId): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $addToSet: { generatedSongIds: songId },
        $set: { updatedAt: new Date() },
      },
    );
  }

  async addScript(id: ObjectId, scriptId: ObjectId): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $addToSet: { generatedScriptIds: scriptId },
        $set: { updatedAt: new Date() },
      },
    );
  }
}
