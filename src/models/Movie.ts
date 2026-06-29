import mongoose, { Schema, Document } from 'mongoose';

export interface IMovie extends Document {
  code: string;
  fileId: string;
  title?: string;
  year?: number;
  caption?: string;
  messageId?: number;
  channelId?: number;
  addedAt: Date;
}

const MovieSchema: Schema = new Schema({
  code: { type: String, required: true, unique: true },
  fileId: { type: String, required: true },
  title: { type: String, required: false },
  year: { type: Number, required: false },
  caption: { type: String, required: false },
  messageId: { type: Number, required: false },
  channelId: { type: Number, required: false },
  addedAt: { type: Date, default: Date.now }
});

export const Movie = mongoose.model<IMovie>('Movie', MovieSchema);
