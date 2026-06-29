import mongoose, { Schema, Document } from 'mongoose';

export interface ISubChannel extends Document {
  channelId: string;
  title: string;
  link: string;
  addedAt: Date;
  skipCheck: boolean;
}

const SubChannelSchema: Schema = new Schema({
  channelId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  link: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
  skipCheck: { type: Boolean, default: false }
});

export const SubChannel = mongoose.model<ISubChannel>('SubChannel', SubChannelSchema);
