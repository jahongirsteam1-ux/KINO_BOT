import mongoose, { Schema, Document } from 'mongoose';

export interface IAutoMessage extends Document {
  messageId: number;
  fromChatId: number;
  addedAt: Date;
  lastSentAt?: Date;
}

const AutoMessageSchema: Schema = new Schema({
  messageId: { type: Number, required: true },
  fromChatId: { type: Number, required: true },
  addedAt: { type: Date, default: Date.now },
  lastSentAt: { type: Date, required: false }
});

export const AutoMessage = mongoose.model<IAutoMessage>('AutoMessage', AutoMessageSchema);
