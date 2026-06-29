import 'dotenv/config';
import { Bot } from 'grammy';
import { connectDB } from './db';
import { userHandler } from './handlers/user';
import { adminHandler } from './handlers/admin';
import { Movie } from './models/Movie';

// Initialize bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN is not defined.');
  process.exit(1);
}

const bot = new Bot(token);

// ─── CHANNEL POST HANDLER ─────────────────────────────────────────────────────
// When admin posts a video in the connected channel, bot auto-saves it.
// Caption format (each on a new line):
//   Line 1: movie code     (required)  e.g. 001
//   Line 2: movie title    (optional)  e.g. Inception
//   Line 3: year           (optional)  e.g. 2010
//   Line 4+: description   (optional)
//
// Example caption:
//   001
//   Inception
//   2010
//   Ajoyib kino!

bot.on('channel_post:video', async (ctx) => {
  const channelIdEnv = process.env.CHANNEL_ID;
  const post = ctx.channelPost;
  const chatId = post.chat.id;
  const chatUsername = (post.chat as any).username ? `@${(post.chat as any).username}` : null;

  // Only process posts from the configured channel
  if (channelIdEnv) {
    const isMatchById = String(chatId) === channelIdEnv;
    const isMatchByUsername = chatUsername === channelIdEnv;
    if (!isMatchById && !isMatchByUsername) return;
  }

  const rawCaption = post.caption || '';
  const lines = rawCaption.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return; // No caption, skip

  const code = lines[0];
  const title = lines[1] || undefined;

  let year: number | undefined;
  let descriptionLines: string[] = [];

  if (lines[2] && /^\d{4}$/.test(lines[2])) {
    year = parseInt(lines[2]);
    descriptionLines = lines.slice(3);
  } else {
    descriptionLines = lines.slice(2);
  }

  const caption = descriptionLines.join('\n') || undefined;
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
    console.error('❌ Kanal postidan kino saqlashda xatolik:', err);
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
