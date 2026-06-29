import 'dotenv/config';
import { Bot } from 'grammy';
import { connectDB } from './db';
import { userHandler } from './handlers/user';
import { adminHandler } from './handlers/admin';
import { Movie } from './models/Movie';
import { Settings } from './models/Settings';

// Initialize bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN is not defined.');
  process.exit(1);
}

const bot = new Bot(token);

// ─── Get channel ID (DB first, fallback to .env) ──────────────────────────────
export const getChannelId = async (): Promise<string | null> => {
  try {
    const setting = await Settings.findOne({ key: 'channel_id' });
    if (setting?.value) return setting.value;
  } catch (_) {}
  return process.env.CHANNEL_ID || null;
};

// ─── CHANNEL POST HANDLER ─────────────────────────────────────────────────────
// Caption format:
//   Line 1: movie code  (required)  e.g. 001
//   Line 2: movie title (optional)  e.g. Inception
//   Line 3: year        (optional)  e.g. 2010
//   Line 4+: description (optional)

bot.on('channel_post:video', async (ctx) => {
  const configuredChannelId = await getChannelId();
  const post = ctx.channelPost;
  const chatId = post.chat.id;
  const chatUsername = (post.chat as any).username
    ? `@${(post.chat as any).username}`
    : null;

  // Only process from the configured channel
  if (configuredChannelId) {
    const matchById = String(chatId) === configuredChannelId;
    const matchByUsername = chatUsername === configuredChannelId;
    if (!matchById && !matchByUsername) return;
  }

  const rawCaption = post.caption || '';
  const lines = rawCaption.split('\n').map((l: string) => l.trim()).filter(Boolean);
  if (lines.length === 0) return;

  const code = lines[0];
  const title = lines[1] || undefined;

  let year: number | undefined;
  let descLines: string[] = [];

  if (lines[2] && /^\d{4}$/.test(lines[2])) {
    year = parseInt(lines[2]);
    descLines = lines.slice(3);
  } else {
    descLines = lines.slice(2);
  }

  const caption = descLines.join('\n') || undefined;
  const fileId = post.video.file_id;
  const messageId = post.message_id;

  try {
    await Movie.findOneAndUpdate(
      { code },
      { code, title, year, caption, fileId, messageId, channelId: chatId },
      { upsert: true, new: true }
    );
    console.log(`✅ Kanal postidan kino saqlandi: [${code}] ${title ?? '—'}`);
  } catch (err) {
    console.error('❌ Kino saqlashda xatolik:', err);
  }
});

// ─── HANDLERS ─────────────────────────────────────────────────────────────────
bot.use(adminHandler);
bot.use(userHandler);

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error(`❌ Update ${err.ctx.update.update_id} da xatolik:`, err.error);
});

// ─── START ────────────────────────────────────────────────────────────────────
const startBot = async () => {
  await connectDB();
  console.log('🤖 Bot ishga tushmoqda...');
  bot.start();
};

startBot();
