import { Composer, InlineKeyboard } from 'grammy';
import { Movie } from '../models/Movie';
import { User } from '../models/User';
import { SubChannel } from '../models/SubChannel';

export const adminHandler = new Composer();

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getAdminIds = (): number[] => {
  const raw = process.env.ADMIN_IDS || '';
  return raw.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
};
const isAdmin = (userId: number) => getAdminIds().includes(userId);

// Silently ignore non-admins
adminHandler.use(async (ctx, next) => {
  if (ctx.from && isAdmin(ctx.from.id)) await next();
});

// ─── STATE ────────────────────────────────────────────────────────────────────
type AdminState =
  | { type: 'add_waiting_info' }
  | { type: 'add_waiting_video'; code: string; title?: string; year?: number }
  | { type: 'delete_waiting_code' }
  | { type: 'broadcast_waiting_message' }
  | { type: 'sub_waiting_channel' };

const adminStates = new Map<number, AdminState>();

// ─── KEYBOARDS ────────────────────────────────────────────────────────────────
const mainPanel = new InlineKeyboard()
  .text('➕ Kino qo\'shish', 'admin:add').row()
  .text('👥 Foydalanuvchilar', 'admin:users').text('📢 Xabar yuborish', 'admin:broadcast').row()
  .text('📋 Kinolar ro\'yxati', 'admin:list').text('🗑️ Kino o\'chirish', 'admin:delete').row()
  .text('🔒 Majburiy obuna', 'admin:subscriptions').row()
  .text('❌ Yopish', 'admin:close');

const backBtn = new InlineKeyboard().text('🔙 Orqaga', 'admin:back');

// ─── /panel ───────────────────────────────────────────────────────────────────
adminHandler.command('panel', async (ctx) => {
  adminStates.delete(ctx.from!.id);
  await ctx.reply('🎛 <b>Admin Panel</b>\n\nAmal tanlang:', {
    parse_mode: 'HTML',
    reply_markup: mainPanel
  });
});

// ─── CALLBACKS ────────────────────────────────────────────────────────────────

adminHandler.callbackQuery('admin:back', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.delete(ctx.from.id);
  await ctx.editMessageText('🎛 <b>Admin Panel</b>\n\nAmal tanlang:', {
    parse_mode: 'HTML', reply_markup: mainPanel
  });
});

adminHandler.callbackQuery('admin:close', async (ctx) => {
  await ctx.answerCallbackQuery('Panel yopildi ✅');
  adminStates.delete(ctx.from.id);
  await ctx.deleteMessage();
});

// ➕ Kino qo'shish
adminHandler.callbackQuery('admin:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'add_waiting_info' });
  await ctx.editMessageText(
    '➕ <b>Kino qo\'shish</b>\n\nQuyidagi formatda yozing:\n<code>/add [kod] [nomi] [yil]</code>\n\n📌 Misol:\n<code>/add 001 Inception 2010</code>\n<code>/add 002</code> (nomi va yilsiz ham bo\'ladi)',
    { parse_mode: 'HTML', reply_markup: backBtn }
  );
});

// 📋 Kinolar ro'yxati
adminHandler.callbackQuery('admin:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    if (movies.length === 0) {
      await ctx.editMessageText('📋 <b>Kinolar ro\'yxati</b>\n\n⚠️ Hech qanday kino topilmadi.', {
        parse_mode: 'HTML', reply_markup: backBtn
      });
      return;
    }
    let text = `📋 <b>Kinolar ro'yxati (${movies.length} ta):</b>\n\n`;
    movies.forEach((m, i) => {
      text += `${i + 1}. <code>${m.code}</code> — ${m.title ?? '—'}${m.year ? ` (${m.year})` : ''}\n`;
    });
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: backBtn });
  } catch (err) {
    console.error(err);
    await ctx.editMessageText('❌ Xatolik yuz berdi.', { reply_markup: backBtn });
  }
});

// 🗑️ Kino o'chirish
adminHandler.callbackQuery('admin:delete', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'delete_waiting_code' });
  await ctx.editMessageText(
    '🗑️ <b>Kino o\'chirish</b>\n\nO\'chirmoqchi bo\'lgan kinoning kodini yuboring:\n\n📌 Misol: <code>001</code>',
    { parse_mode: 'HTML', reply_markup: backBtn }
  );
});

// 👥 Foydalanuvchilar
adminHandler.callbackQuery('admin:users', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const total = await User.countDocuments();
    const last5 = await User.find().sort({ joinedAt: -1 }).limit(5);
    let text = `👥 <b>Foydalanuvchilar</b>\n\n📊 Jami: <b>${total} ta</b>\n\n🕐 <b>Oxirgi qo'shilganlar:</b>\n`;
    last5.forEach((u, i) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Noma\'lum';
      const uname = u.username ? ` (@${u.username})` : '';
      text += `${i + 1}. ${name}${uname}\n`;
    });
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: backBtn });
  } catch (err) {
    console.error(err);
    await ctx.editMessageText('❌ Xatolik yuz berdi.', { reply_markup: backBtn });
  }
});

// 📢 Broadcast
adminHandler.callbackQuery('admin:broadcast', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'broadcast_waiting_message' });
  await ctx.editMessageText(
    '📢 <b>Barcha foydalanuvchilarga xabar yuborish</b>\n\nYubormoqchi bo\'lgan xabaringizni yozing:',
    { parse_mode: 'HTML', reply_markup: backBtn }
  );
});

// ─── 🔒 MAJBURIY OBUNA ────────────────────────────────────────────────────────

// Build subscription management panel dynamically
const buildSubPanel = async () => {
  const channels = await SubChannel.find().sort({ addedAt: -1 });
  const keyboard = new InlineKeyboard();

  if (channels.length === 0) {
    keyboard.text('➕ Kanal qo\'shish', 'admin:sub_add').row();
  } else {
    channels.forEach(ch => {
      keyboard
        .url(`📢 ${ch.title}`, ch.link)
        .text('🗑', `admin:sub_remove:${ch._id}`)
        .row();
    });
    keyboard.text('➕ Kanal qo\'shish', 'admin:sub_add').row();
  }

  keyboard.text('🔙 Orqaga', 'admin:back');

  let text = `🔒 <b>Majburiy obuna kanallari</b>\n\n`;
  if (channels.length === 0) {
    text += '⚠️ Hozircha hech qanday kanal qo\'shilmagan.';
  } else {
    text += `Jami: <b>${channels.length} ta kanal</b>\n\n`;
    channels.forEach((ch, i) => {
      text += `${i + 1}. ${ch.title} — <code>${ch.channelId}</code>\n`;
    });
    text += '\n🗑 tugmasi — kanalini o\'chirish';
  }

  return { text, keyboard };
};

adminHandler.callbackQuery('admin:subscriptions', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { text, keyboard } = await buildSubPanel();
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

adminHandler.callbackQuery('admin:sub_add', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'sub_waiting_channel' });
  await ctx.editMessageText(
    '🔒 <b>Kanal qo\'shish</b>\n\nKanal username\'ini yuboring:\n\n📌 Misol: <code>@mening_kanalim</code>\n\n⚠️ Bot shu kanalda <b>admin</b> bo\'lishi shart!',
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:subscriptions') }
  );
});

// Remove subscription channel callback
adminHandler.callbackQuery(/^admin:sub_remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const mongoId = ctx.match[1];
  try {
    const removed = await SubChannel.findByIdAndDelete(mongoId);
    if (removed) {
      const { text, keyboard } = await buildSubPanel();
      await ctx.editMessageText(
        `✅ <b>${removed.title}</b> kanali o'chirildi!\n\n` + text,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    }
  } catch (err) {
    console.error(err);
    await ctx.answerCallbackQuery('❌ Xatolik yuz berdi');
  }
});

// ─── MESSAGE HANDLERS ─────────────────────────────────────────────────────────
adminHandler.on('message:text', async (ctx, next) => {
  const userId = ctx.from!.id;
  const state = adminStates.get(userId);

  // --- Delete: waiting for code ---
  if (state?.type === 'delete_waiting_code') {
    adminStates.delete(userId);
    const code = ctx.message.text.trim();
    try {
      const result = await Movie.findOneAndDelete({ code });
      if (result) {
        await ctx.reply(`✅ <b>${code}</b> — "${result.title ?? 'Nomsiz'}" o'chirildi!`, {
          parse_mode: 'HTML', reply_markup: mainPanel
        });
      } else {
        await ctx.reply(`❌ <b>${code}</b> kodli kino topilmadi.`, {
          parse_mode: 'HTML', reply_markup: mainPanel
        });
      }
    } catch (err) {
      console.error(err);
      await ctx.reply('❌ Xatolik yuz berdi.');
    }
    return;
  }

  // --- Broadcast: waiting for message ---
  if (state?.type === 'broadcast_waiting_message') {
    adminStates.delete(userId);
    const text = ctx.message.text;
    const users = await User.find({}, 'telegramId');
    let sent = 0, failed = 0;

    await ctx.reply(`📤 Xabar yuborilmoqda... (${users.length} ta foydalanuvchi)`);
    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegramId, text);
        sent++;
      } catch { failed++; }
      await new Promise(r => setTimeout(r, 50));
    }
    await ctx.reply(
      `📢 <b>Broadcast yakunlandi!</b>\n\n✅ Yuborildi: ${sent} ta\n❌ Xato: ${failed} ta`,
      { parse_mode: 'HTML', reply_markup: mainPanel }
    );
    return;
  }

  // --- Subscription: waiting for channel ---
  if (state?.type === 'sub_waiting_channel') {
    adminStates.delete(userId);
    const input = ctx.message.text.trim();

    // Validate format
    if (!input.startsWith('@') && !input.startsWith('-')) {
      await ctx.reply(
        '❌ Noto\'g\'ri format. Kanal username\'ini <code>@</code> bilan yuboring.\nMasalan: <code>@mening_kanalim</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    try {
      // Get channel info from Telegram
      const chat = await ctx.api.getChat(input) as any;
      const channelId = String(chat.id);
      const title = chat.title || chat.username || input;
      const username = chat.username;
      const link = username
        ? `https://t.me/${username}`
        : `https://t.me/c/${String(chat.id).replace('-100', '')}`;

      await SubChannel.findOneAndUpdate(
        { channelId },
        { channelId, title, link },
        { upsert: true, new: true }
      );

      const { text: panelText, keyboard } = await buildSubPanel();
      await ctx.reply(
        `✅ <b>${title}</b> kanali qo'shildi!\n\n` + panelText,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err: any) {
      console.error(err);
      await ctx.reply(
        '❌ Kanal topilmadi yoki bot kanalda admin emas.\n\nBotni kanalga admin qilib, qaytadan urinib ko\'ring.',
        { reply_markup: mainPanel }
      );
    }
    return;
  }

  // --- No pending state: pass to userHandler ---
  await next();
});

// Video handler (for /add flow)
adminHandler.on('message:video', async (ctx, next) => {
  const userId = ctx.from!.id;
  const state = adminStates.get(userId);

  if (state?.type !== 'add_waiting_video') {
    await next();
    return;
  }

  adminStates.delete(userId);
  const fileId = ctx.message.video.file_id;

  try {
    const movie = new Movie({
      code: state.code,
      fileId,
      title: state.title,
      year: state.year
    });
    await movie.save();
    await ctx.reply(
      `✅ <b>Kino qo'shildi!</b>\n\n📌 Kod: <code>${state.code}</code>\n🎬 Nomi: <b>${state.title ?? '—'}</b>${state.year ? `\n📅 Yil: ${state.year}` : ''}`,
      { parse_mode: 'HTML', reply_markup: mainPanel }
    );
  } catch (err: any) {
    if (err.code === 11000) {
      await ctx.reply(`❌ <b>${state.code}</b> kodi bilan kino allaqachon mavjud!`, {
        parse_mode: 'HTML', reply_markup: mainPanel
      });
    } else {
      console.error(err);
      await ctx.reply('❌ Saqlashda xatolik yuz berdi.');
    }
  }
});

// ─── COMMANDS ─────────────────────────────────────────────────────────────────

adminHandler.command('add', async (ctx) => {
  const args = ctx.match?.trim();
  if (!args) {
    await ctx.reply('❌ Format: <code>/add [kod] [nomi(ixtiyoriy)] [yil(ixtiyoriy)]</code>', { parse_mode: 'HTML' });
    return;
  }

  const parts = args.split(/\s+/);
  const code = parts[0];
  let year: number | undefined;
  let titleParts = parts.slice(1);

  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d{4}$/.test(last)) {
    year = parseInt(last);
    titleParts = parts.slice(1, -1);
  }

  const title = titleParts.join(' ') || undefined;
  adminStates.set(ctx.from!.id, { type: 'add_waiting_video', code, title, year });

  await ctx.reply(
    `✅ Ma'lumotlar qabul qilindi!\n\n📌 Kod: <code>${code}</code>\n🎬 Nomi: <b>${title ?? '—'}</b>${year ? `\n📅 Yil: ${year}` : ''}\n\nEndi kino videosini yuboring:`,
    { parse_mode: 'HTML' }
  );
});

adminHandler.command('delete', async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply('❌ Format: <code>/delete [kod]</code>', { parse_mode: 'HTML' });
    return;
  }
  try {
    const result = await Movie.findOneAndDelete({ code });
    if (result) {
      await ctx.reply(`✅ <b>${code}</b> — "${result.title ?? 'Nomsiz'}" o'chirildi!`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`❌ <b>${code}</b> kodli kino topilmadi.`, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

adminHandler.command('list', async (ctx) => {
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    if (movies.length === 0) {
      await ctx.reply('📋 Kinolar ro\'yxati bo\'sh.');
      return;
    }
    let text = `📋 <b>Kinolar ro'yxati (${movies.length} ta):</b>\n\n`;
    movies.forEach((m, i) => {
      text += `${i + 1}. <code>${m.code}</code> — ${m.title ?? '—'}${m.year ? ` (${m.year})` : ''}\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});
