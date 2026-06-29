import mongoose, { Schema, Document } from 'mongoose';

export interface IMovie extends Document {
  code: string;
  fileId: string;
  title: string;
  year?: number;
  caption?: string;
  addedAt: Date;
}

const MovieSchema: Schema = new Schema({
  code: { type: String, required: true, unique: true },
  fileId: { type: String, required: true },
  title: { type: String, required: true },
  year: { type: Number, required: false },
  caption: { type: String, required: false },
  addedAt: { type: Date, default: Date.now }
});

export const Movie = mongoose.model<IMovie>('Movie', MovieSchema);
