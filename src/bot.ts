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
// Shared handler logic for new and edited channel video posts
const handleChannelVideo = async (ctx: any, post: any) => {
  const { getChannelId } = await import('./helpers/settings');
  const configuredChannelId = await getChannelId();

  const chatId = post.chat.id;
  const chatUsername = (post.chat as any).username
    ? `@${(post.chat as any).username}`
    : null;

  console.log(`📡 Channel post received from: ${chatId} (${chatUsername}). Configured: ${configuredChannelId}`);

  if (configuredChannelId) {
    const matchById = String(chatId) === configuredChannelId;
    const matchByUsername = chatUsername === configuredChannelId;
    if (!matchById && !matchByUsername) {
      console.log(`❌ Channel ID mismatch — skipping. Got: ${chatId}, Expected: ${configuredChannelId}`);
      return;
    }
  }

  const rawCaption = post.caption || '';
  const lines = rawCaption.split('\n').map((l: string) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    console.log('⚠️ Caption bo\'sh — kino saqlanmadi.');
    return;
  }

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
};

bot.on('channel_post:video', async (ctx) => {
  await handleChannelVideo(ctx, ctx.channelPost);
});

bot.on('edited_channel_post:video', async (ctx) => {
  await handleChannelVideo(ctx, ctx.editedChannelPost);
});

// ─── JOIN REQUEST HANDLER ───────────────────────────────────────────────────────
bot.on('chat_join_request', async (ctx) => {
  try {
    await ctx.approveChatJoinRequest(ctx.from.id);
    // Foydalanuvchiga tasdiqlanganligi haqida xabar yuborish
    await bot.api.sendMessage(
      ctx.from.id,
      `✅ <b>${ctx.chat.title}</b> kanaliga so'rovingiz tasdiqlandi!\nEndi kinolarni botdan yuklab olishingiz mumkin.`,
      { parse_mode: 'HTML' }
    ).catch(() => {}); // Agar foydalanuvchi botni bloklagan bo'lsa e'tiborsiz qoldirish
  } catch (err) {
    console.error('❌ Zayavkani tasdiqlashda xatolik:', err);
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

  const webhookUrl = process.env.WEBHOOK_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

  if (webhookUrl) {
    // ── WEBHOOK mode (Railway / production) ──────────────────────────────────
    const { webhookCallback } = await import('grammy');
    const express = (await import('express')).default;

    const app = express();
    app.use(express.json());

    const port = parseInt(process.env.PORT || '3000');
    const path = `/webhook/${token}`;

    app.post(path, webhookCallback(bot, 'express'));

    // Health-check endpoint
    app.get('/', (_req: any, res: any) => res.send('Bot is running ✅'));

    app.listen(port, async () => {
      console.log(`🌐 Webhook server started on port ${port}`);
      await bot.api.setWebhook(`${webhookUrl}${path}`, {
        allowed_updates: ['message', 'callback_query', 'channel_post', 'edited_channel_post', 'chat_join_request'],
        drop_pending_updates: true,
      });
      console.log(`✅ Webhook set: ${webhookUrl}${path}`);
    });
  } else {
    // ── POLLING mode (local development) ────────────────────────────────────
    await bot.start({
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query', 'channel_post', 'edited_channel_post', 'chat_join_request'],
      onStart: () => console.log('✅ Bot muvaffaqiyatli ishga tushdi! (polling)'),
    });
  }
};

startBot();
