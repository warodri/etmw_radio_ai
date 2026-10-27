import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { HostDocument } from './host.model.js';

const WITHOUT_AVATAR_DATA = { projection: { 'avatar.data': 0 } } as const;

export class HostRepository {
  private collection(): Collection<HostDocument> {
    return getDatabase().collection<HostDocument>('hosts');
  }

  async create(document: HostDocument): Promise<WithId<HostDocument>> {
    const result = await this.collection().insertOne(document);

    return {
      ...document,
      _id: result.insertedId,
    };
  }

  async listByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<HostDocument>[]> {
    return this.collection()
      .find({ stationId, ownerId }, WITHOUT_AVATAR_DATA)
      .sort({ createdAt: 1 })
      .toArray();
  }

  async findOwned(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<WithId<HostDocument> | null> {
    return this.collection().findOne(
      { _id: id, stationId, ownerId },
      WITHOUT_AVATAR_DATA,
    );
  }

  async updateOwned(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
    fields: Partial<HostDocument>,
  ): Promise<WithId<HostDocument> | null> {
    return this.collection().findOneAndUpdate(
      { _id: id, stationId, ownerId },
      { $set: fields },
      { returnDocument: 'after', ...WITHOUT_AVATAR_DATA },
    );
  }

  async deleteOwned(
    id: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<boolean> {
    const result = await this.collection().deleteOne({
      _id: id,
      stationId,
      ownerId,
    });

    return result.deletedCount === 1;
  }

  async findAvatar(
    id: ObjectId,
  ): Promise<WithId<HostDocument> | null> {
    return this.collection().findOne(
      { _id: id },
      { projection: { avatar: 1, updatedAt: 1 } },
    );
  }

  async deleteByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<void> {
    await this.collection().deleteMany({ stationId, ownerId });
  }
}
