import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { PlaylistDocument } from './playlist.model.js';

export class PlaylistRepository {
  private collection(): Collection<PlaylistDocument> {
    return getDatabase().collection<PlaylistDocument>('station_playlists');
  }

  async findByStation(
    stationId: ObjectId,
  ): Promise<WithId<PlaylistDocument> | null> {
    return this.collection().findOne({ stationId });
  }

  async save(
    stationId: ObjectId,
    ownerId: ObjectId,
    items: PlaylistDocument['items'],
    updatedAt: Date,
  ): Promise<WithId<PlaylistDocument>> {
    const result = await this.collection().findOneAndUpdate(
      { stationId },
      {
        $set: { ownerId, items, updatedAt },
        $setOnInsert: { stationId, createdAt: updatedAt },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!result) {
      throw new Error('The playlist could not be saved.');
    }

    return result;
  }

  async deleteByStation(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<void> {
    await this.collection().deleteOne({ stationId, ownerId });
  }
}
