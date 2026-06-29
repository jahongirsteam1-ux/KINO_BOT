import { Composer, InlineKeyboard } from 'grammy';
import { Movie } from '../models/Movie';
import { User } from '../models/User';

export const adminHandler = new Composer();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const getAdminIds = (): number[] => {
  const adminIdsStr = process.env.ADMIN_IDS || '';
  return adminIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
};

const isAdmin = (userId: number): boolean => getAdminIds().includes(userId);

// Admin middleware — non-admins are silently ignored
adminHandler.use(async (ctx, next) => {
  if (ctx.from && isAdmin(ctx.from.id)) {
    await next();
  }
});

// ─── STATE MAPS ───────────────────────────────────────────────────────────────

type AdminState =
  | { type: 'add_waiting_info' }
  | { type: 'add_waiting_video'; code: string; title: string; year?: number }
  | { type: 'delete_waiting_code' }
  | { type: 'broadcast_waiting_message' };

const adminStates = new Map<number, AdminState>();

// ─── KEYBOARDS ────────────────────────────────────────────────────────────────

const mainPanel = new InlineKeyboard()
  .text('➕ Kino qo\'shish', 'admin:add').row()
  .text('👥 Foydalanuvchilar', 'admin:users').text('📢 Xabar yuborish', 'admin:broadcast').row()
  .text('📋 Kinolar ro\'yxati', 'admin:list').text('🗑️ Kino o\'chirish', 'admin:delete').row()
  .text('❌ Yopish', 'admin:close');

const backBtn = new InlineKeyboard().text('🔙 Orqaga', 'admin:back');

// ─── /panel COMMAND ───────────────────────────────────────────────────────────

adminHandler.command('panel', async (ctx) => {
  adminStates.delete(ctx.from!.id);
  await ctx.reply('🎛 <b>Admin Panel</b>\n\nAmal tanlang:', {
    parse_mode: 'HTML',
    reply_markup: mainPanel
  });
});

// ─── CALLBACK QUERIES ─────────────────────────────────────────────────────────

// Back to main panel
adminHandler.callbackQuery('admin:back', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.delete(ctx.from.id);
  await ctx.editMessageText('🎛 <b>Admin Panel</b>\n\nAmal tanlang:', {
    parse_mode: 'HTML',
    reply_markup: mainPanel
  });
});

// Close panel
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
    '➕ <b>Kino qo\'shish</b>\n\nQuyidagi formatda yozing:\n<code>/add [kod] [nomi] [yil]</code>\n\n📌 Misol:\n<code>/add 001 Inception 2010</code>\n<code>/add 002 Titanic</code>',
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
      text += `${i + 1}. <code>${m.code}</code> — ${m.title}${m.year ? ` (${m.year})` : ''}\n`;
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
    '🗑️ <b>Kino o\'chirish</b>\n\nO\'chirmoqchi bo\'lgan kinoning <b>kodini</b> yuboring:\n\n📌 Misol: <code>001</code>',
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
      const username = u.username ? ` (@${u.username})` : '';
      text += `${i + 1}. ${name}${username}\n`;
    });

    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: backBtn });
  } catch (err) {
    console.error(err);
    await ctx.editMessageText('❌ Xatolik yuz berdi.', { reply_markup: backBtn });
  }
});

// 📢 Xabar yuborish (broadcast)
adminHandler.callbackQuery('admin:broadcast', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'broadcast_waiting_message' });
  await ctx.editMessageText(
    '📢 <b>Barcha foydalanuvchilarga xabar yuborish</b>\n\nYubormoqchi bo\'lgan xabaringizni yozing:',
    { parse_mode: 'HTML', reply_markup: backBtn }
  );
});

// ─── MESSAGE HANDLERS ─────────────────────────────────────────────────────────

// Text messages from admin
adminHandler.on('message:text', async (ctx, next) => {
  const userId = ctx.from!.id;
  const state = adminStates.get(userId);

  // --- Pending delete ---
  if (state?.type === 'delete_waiting_code') {
    adminStates.delete(userId);
    const code = ctx.message.text.trim();
    try {
      const result = await Movie.findOneAndDelete({ code });
      if (result) {
        await ctx.reply(
          `✅ <b>${code}</b> — "<b>${result.title}</b>" o'chirildi!`,
          { parse_mode: 'HTML', reply_markup: mainPanel }
        );
      } else {
        await ctx.reply(
          `❌ <b>${code}</b> kodli kino topilmadi.`,
          { parse_mode: 'HTML', reply_markup: mainPanel }
        );
      }
    } catch (err) {
      console.error(err);
      await ctx.reply('❌ Xatolik yuz berdi.');
    }
    return;
  }

  // --- Pending broadcast ---
  if (state?.type === 'broadcast_waiting_message') {
    adminStates.delete(userId);
    const text = ctx.message.text;
    const users = await User.find({}, 'telegramId');
    let sent = 0;
    let failed = 0;

    await ctx.reply(`📤 Xabar yuborilmoqda... (${users.length} ta foydalanuvchi)`);

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegramId, text);
        sent++;
      } catch {
        failed++;
      }
      // small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 50));
    }

    await ctx.reply(
      `📢 <b>Broadcast yakunlandi!</b>\n\n✅ Yuborildi: ${sent} ta\n❌ Xato: ${failed} ta`,
      { parse_mode: 'HTML', reply_markup: mainPanel }
    );
    return;
  }

  // --- No pending state: pass to userHandler (so admins can search movies too) ---
  await next();
});

// Video messages from admin (for adding movie)
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
      `✅ <b>Kino qo'shildi!</b>\n\n📌 Kod: <code>${state.code}</code>\n🎬 Nomi: <b>${state.title}</b>${state.year ? `\n📅 Yil: ${state.year}` : ''}`,
      { parse_mode: 'HTML', reply_markup: mainPanel }
    );
  } catch (err: any) {
    if (err.code === 11000) {
      await ctx.reply(
        `❌ <b>${state.code}</b> kodi bilan kino allaqachon mavjud!`,
        { parse_mode: 'HTML', reply_markup: mainPanel }
      );
    } else {
      console.error(err);
      await ctx.reply('❌ Saqlashda xatolik yuz berdi.');
    }
  }
});

// ─── /add COMMAND ─────────────────────────────────────────────────────────────

adminHandler.command('add', async (ctx) => {
  const args = ctx.match?.trim();
  if (!args) {
    await ctx.reply('❌ Format: <code>/add [kod] [nomi] [yil]</code>\nMasalan: <code>/add 001 Inception 2010</code>', {
      parse_mode: 'HTML'
    });
    return;
  }

  const parts = args.split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply('❌ Kamida kod va nom kiriting.\nMasalan: <code>/add 001 Inception</code>', { parse_mode: 'HTML' });
    return;
  }

  const code = parts[0];
  let year: number | undefined;
  let titleParts = parts.slice(1);

  const last = parts[parts.length - 1];
  if (/^\d{4}$/.test(last)) {
    year = parseInt(last);
    titleParts = parts.slice(1, -1);
  }

  const title = titleParts.join(' ');
  if (!title) {
    await ctx.reply('❌ Nom bo\'sh bo\'lishi mumkin emas.');
    return;
  }

  adminStates.set(ctx.from!.id, { type: 'add_waiting_video', code, title, year });
  await ctx.reply(
    `✅ Ma'lumotlar qabul qilindi!\n\n📌 Kod: <code>${code}</code>\n🎬 Nomi: <b>${title}</b>${year ? `\n📅 Yil: ${year}` : ''}\n\nEndi kino videosini yuboring:`,
    { parse_mode: 'HTML' }
  );
});

// ─── /delete COMMAND ──────────────────────────────────────────────────────────

adminHandler.command('delete', async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply('❌ Format: <code>/delete [kod]</code>\nMasalan: <code>/delete 001</code>', { parse_mode: 'HTML' });
    return;
  }
  try {
    const result = await Movie.findOneAndDelete({ code });
    if (result) {
      await ctx.reply(`✅ <b>${code}</b> — "${result.title}" o'chirildi!`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`❌ <b>${code}</b> kodli kino topilmadi.`, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

// ─── /list COMMAND ────────────────────────────────────────────────────────────

adminHandler.command('list', async (ctx) => {
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    if (movies.length === 0) {
      await ctx.reply('📋 Kinolar ro\'yxati bo\'sh.');
      return;
    }
    let text = `📋 <b>Kinolar ro'yxati (${movies.length} ta):</b>\n\n`;
    movies.forEach((m, i) => {
      text += `${i + 1}. <code>${m.code}</code> — ${m.title}${m.year ? ` (${m.year})` : ''}\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});
