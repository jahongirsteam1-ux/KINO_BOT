import { Settings } from '../models/Settings';

/**
 * Returns the configured movie channel ID.
 * Checks DB first, falls back to CHANNEL_ID env variable.
 */
export const getChannelId = async (): Promise<string | null> => {
  try {
    const setting = await Settings.findOne({ key: 'channel_id' });
    if (setting?.value) return setting.value;
  } catch (_) {}
  return process.env.CHANNEL_ID || null;
};
