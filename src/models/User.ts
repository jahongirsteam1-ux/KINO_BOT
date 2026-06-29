import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: Date;
}

const UserSchema: Schema = new Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String, required: false },
  firstName: { type: String, required: false },
  lastName: { type: String, required: false },
  joinedAt: { type: Date, default: Date.now }
});

export const User = mongoose.model<IUser>('User', UserSchema);
