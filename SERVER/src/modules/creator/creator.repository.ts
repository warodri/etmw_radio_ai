import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import {
  CreatorPreferencesDocument,
  CreatorSongDocument,
} from './creator.model.js';

export class CreatorSongRepository {
  private collection(): Collection<CreatorSongDocument> {
    return getDatabase().collection<CreatorSongDocument>('creator_songs');
  }

  async create(
    document: CreatorSongDocument,
  ): Promise<WithId<CreatorSongDocument>> {
    const result = await this.collection().insertOne(document);

    return {
      ...document,
      _id: result.insertedId,
    };
  }

  async listByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
    skip: number,
    limit: number,
  ): Promise<WithId<CreatorSongDocument>[]> {
    return this.collection()
      .find({ stationId, ownerId })
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

  async countPending(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<number> {
    return this.collection().countDocuments({
      stationId,
      ownerId,
      status: { $in: ['queued', 'generating'] },
    });
  }

  async countCompleted(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<number> {
    return this.collection().countDocuments({
      stationId,
      ownerId,
      status: 'completed',
    });
  }

  async listCompletedByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
    limit = 200,
  ): Promise<WithId<CreatorSongDocument>[]> {
    return this.collection()
      .find({
        stationId,
        ownerId,
        status: 'completed',
        songsSongId: { $ne: null },
      })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async listPending(
    stationId: ObjectId,
    ownerId: ObjectId,
    limit = 25,
  ): Promise<WithId<CreatorSongDocument>[]> {
    return this.collection()
      .find({
        stationId,
        ownerId,
        status: { $in: ['queued', 'generating'] },
        songsJobId: { $ne: null },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  async findOwnedSong(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<CreatorSongDocument> | null> {
    return this.collection().findOne({ _id: id, stationId, ownerId });
  }

  async updateSong(
    id: ObjectId,
    fields: Partial<CreatorSongDocument>,
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
    await this.collection().deleteMany({ stationId, ownerId });
  }
}

export class CreatorPreferencesRepository {
  private collection(): Collection<CreatorPreferencesDocument> {
    return getDatabase().collection<CreatorPreferencesDocument>(
      'creator_preferences',
    );
  }

  async find(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<CreatorPreferencesDocument | null> {
    return this.collection().findOne({ stationId, ownerId });
  }

  async upsert(
    stationId: ObjectId,
    ownerId: ObjectId,
    settings: Omit<CreatorPreferencesDocument, '_id' | 'stationId' | 'ownerId'>,
  ): Promise<void> {
    await this.collection().updateOne(
      { stationId, ownerId },
      {
        $set: settings,
        $setOnInsert: { stationId, ownerId },
      },
      { upsert: true },
    );
  }

  async deleteByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<void> {
    await this.collection().deleteOne({ stationId, ownerId });
  }
}
