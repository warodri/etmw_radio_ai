import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { StationDocument } from './station.model.js';

const WITHOUT_ARTWORK_DATA = { projection: { 'artwork.data': 0 } } as const;

export class StationRepository {
  private collection(): Collection<StationDocument> {
    return getDatabase().collection<StationDocument>('stations');
  }

  async create(document: StationDocument): Promise<WithId<StationDocument>> {
    const result = await this.collection().insertOne(document);

    return {
      ...document,
      _id: result.insertedId,
    };
  }

  async findBySlug(slug: string): Promise<WithId<StationDocument> | null> {
    return this.collection().findOne({ slug }, WITHOUT_ARTWORK_DATA);
  }

  async findById(id: string): Promise<WithId<StationDocument> | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    return this.collection().findOne(
      { _id: new ObjectId(id) },
      WITHOUT_ARTWORK_DATA,
    );
  }

  async listPublic(limit = 60): Promise<WithId<StationDocument>[]> {
    return this.collection()
      .find({ status: 'published' }, WITHOUT_ARTWORK_DATA)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async listByOwner(ownerId: ObjectId): Promise<WithId<StationDocument>[]> {
    return this.collection()
      .find({ ownerId }, WITHOUT_ARTWORK_DATA)
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async updateOwned(
    id: ObjectId,
    ownerId: ObjectId,
    fields: Partial<StationDocument>,
  ): Promise<WithId<StationDocument> | null> {
    return this.collection().findOneAndUpdate(
      { _id: id, ownerId },
      { $set: fields },
      { returnDocument: 'after', ...WITHOUT_ARTWORK_DATA },
    );
  }

  async deleteOwned(id: ObjectId, ownerId: ObjectId): Promise<boolean> {
    const result = await this.collection().deleteOne({ _id: id, ownerId });
    return result.deletedCount === 1;
  }

  async findArtwork(
    id: ObjectId,
  ): Promise<WithId<StationDocument> | null> {
    return this.collection().findOne(
      { _id: id },
      { projection: { artwork: 1, updatedAt: 1 } },
    );
  }
}
