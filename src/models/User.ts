import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: Date;
  passedChannels: string[];
}

const UserSchema: Schema = new Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  joinedAt: { type: Date, default: Date.now },
  passedChannels: { type: [String], default: [] }
});

export const User = mongoose.model<IUser>('User', UserSchema);
