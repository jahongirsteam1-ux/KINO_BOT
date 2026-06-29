import mongoose, { Schema, Document } from 'mongoose';

export interface ISubChannel extends Document {
  channelId: string;
  title: string;
  link: string;
  addedAt: Date;
}

const SubChannelSchema: Schema = new Schema({
  channelId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  link: { type: String, required: true },
  addedAt: { type: Date, default: Date.now }
});

export const SubChannel = mongoose.model<ISubChannel>('SubChannel', SubChannelSchema);
