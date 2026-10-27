import { Collection, ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { UserDocument } from './user.model.js';

export class UserRepository {
  private collection(): Collection<UserDocument> {
    return getDatabase().collection<UserDocument>('users');
  }

  async findByEmail(email: string): Promise<WithId<UserDocument> | null> {
    return this.collection().findOne({ email });
  }

  async findById(id: string): Promise<WithId<UserDocument> | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    return this.collection().findOne({ _id: new ObjectId(id) });
  }

  async create(email: string): Promise<WithId<UserDocument>> {
    const now = new Date();
    const document: UserDocument = {
      email,
      status: 'active',
      createdAt: now,
      lastLoginAt: now,
    };

    const result = await this.collection().insertOne(document);

    return {
      ...document,
      _id: result.insertedId,
    };
  }

  async touchLogin(id: ObjectId): Promise<WithId<UserDocument> | null> {
    return this.collection().findOneAndUpdate(
      { _id: id },
      { $set: { lastLoginAt: new Date() } },
      { returnDocument: 'after' },
    );
  }
}
