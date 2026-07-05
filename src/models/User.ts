import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: Date;
  passedChannels: string[];
  history: { movieCode: string; watchedAt: Date }[];
  lastActivityAt: Date;
  lastReEngagedAt?: Date;
}

const UserSchema: Schema = new Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  joinedAt: { type: Date, default: Date.now },
  passedChannels: { type: [String], default: [] },
  history: { 
    type: [{ movieCode: String, watchedAt: { type: Date, default: Date.now } }], 
    default: [] 
  },
  lastActivityAt: { type: Date, default: Date.now },
  lastReEngagedAt: { type: Date, required: false }
});

export const User = mongoose.model<IUser>('User', UserSchema);
