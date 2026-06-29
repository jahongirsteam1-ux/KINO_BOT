import 'dotenv/config';
import { Bot, Composer } from 'grammy';
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

// ─── ADMIN ID HELPER ──────────────────────────────────────────────────────────
const getAdminIds = (): number[] => {
  const raw = process.env.ADMIN_IDS || '';
  return raw.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
};

// ─── CHANNEL POST HANDLER ─────────────────────────────────────────────────────
bot.on('channel_post:video', async (ctx) => {
  const { getChannelId } = await import('./helpers/settings');
  const configuredChannelId = await getChannelId();

  const post = ctx.channelPost;
  const chatId = post.chat.id;
  const chatUsername = (post.chat as any).username
    ? `@${(post.chat as any).username}`
    : null;

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
    console.log(`✅ Kino saqlandi: [${code}] ${title ?? '—'}`);
  } catch (err) {
    console.error('❌ Kino saqlashda xatolik:', err);
  }
});

// ─── ROUTING ──────────────────────────────────────────────────────────────────
// Admin updates go to adminHandler, non-admins go directly to userHandler.
// After adminHandler finishes, userHandler also runs (so admins can search movies too).

bot.filter(
  (ctx) => ctx.from !== undefined && getAdminIds().includes(ctx.from.id),
  adminHandler
);

bot.use(userHandler);

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error(`❌ Update ${err.ctx.update.update_id} da xatolik:`, err.error);
});

// ─── START ────────────────────────────────────────────────────────────────────
const startBot = async () => {
  await connectDB();
  console.log('🤖 Bot ishga tushmoqda...');
  await bot.start({
    drop_pending_updates: true,
    allowed_updates: ['message', 'callback_query', 'channel_post'],
    onStart: () => console.log('✅ Bot muvaffaqiyatli ishga tushdi!'),
  });
};

startBot();
