import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import { Movie } from '../models/Movie';
import { User } from '../models/User';
import { SubChannel } from '../models/SubChannel';
import { Settings } from '../models/Settings';
import { getChannelId } from '../helpers/settings';

export const adminHandler = new Composer();

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getAdminIds = (): number[] => {
  const raw = process.env.ADMIN_IDS || '';
  return raw.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
};
const isAdmin = (userId: number) => getAdminIds().includes(userId);


// ─── STATE ────────────────────────────────────────────────────────────────────
type AdminState =
  | { type: 'add_waiting_video'; code: string; title?: string; year?: number }
  | { type: 'delete_waiting_code' }
  | { type: 'broadcast_waiting_message' }
  | { type: 'sub_waiting_channel' }
  | { type: 'sub_waiting_link'; channelId: string; title: string; defaultLink: string }
  | { type: 'sub_waiting_check'; channelId: string; title: string; link: string }
  | { type: 'settings_waiting_channel' };

const adminStates = new Map<number, AdminState>();

// ─── KEYBOARDS ────────────────────────────────────────────────────────────────

// Bottom reply keyboard
const mainPanel = new Keyboard()
  .text('➕ Kino qo\'shish').row()
  .text('👥 Foydalanuvchilar').text('📢 Xabar yuborish').row()
  .text('📋 Kinolar ro\'yxati').text('🗑️ Kino o\'chirish').row()
  .text('🔒 Majburiy obuna').row()
  .text('⚙️ Sozlamalar').text('❌ Panelni yopish')
  .resized()
  .persistent();

const backBtn = new InlineKeyboard().text('🔙 Orqaga', 'admin:back');

// ─── /admin ───────────────────────────────────────────────────────────────────
adminHandler.command('admin', async (ctx) => {
  adminStates.delete(ctx.from!.id);
  await ctx.reply('🎛 <b>Admin Panel</b>\n\nQuyidagi tugmalardan birini tanlang:', {
    parse_mode: 'HTML',
    reply_markup: mainPanel
  });
});

// ─── REPLY KEYBOARD BUTTON HANDLERS ──────────────────────────────────────────

const handleAddButton = async (ctx: any) => {
  await ctx.reply(
    '➕ <b>Kino qo\'shish</b>\n\nQuyidagi formatda yozing:\n<code>/add [kod] [nomi] [yil]</code>\n\n📌 Misol:\n<code>/add 001 Inception 2010</code>\n<code>/add 002</code> (nomi va yilsiz ham bo\'ladi)',
    { parse_mode: 'HTML' }
  );
};

const handleUsersButton = async (ctx: any) => {
  try {
    const total = await User.countDocuments();
    const last5 = await User.find().sort({ joinedAt: -1 }).limit(5);
    let text = `👥 <b>Foydalanuvchilar</b>\n\n📊 Jami: <b>${total} ta</b>\n\n🕐 <b>Oxirgi qo'shilganlar:</b>\n`;
    last5.forEach((u, i) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Noma\'lum';
      const uname = u.username ? ` (@${u.username})` : '';
      text += `${i + 1}. ${name}${uname}\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
};

const handleBroadcastButton = async (ctx: any) => {
  adminStates.set(ctx.from.id, { type: 'broadcast_waiting_message' });
  await ctx.reply(
    '📢 <b>Barcha foydalanuvchilarga xabar yuborish</b>\n\nYubormoqchi bo\'lgan xabaringizni yozing:\n\n❌ Bekor qilish uchun /admin yozing',
    { parse_mode: 'HTML' }
  );
};

const handleListButton = async (ctx: any) => {
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    if (movies.length === 0) {
      await ctx.reply('📋 Kinolar ro\'yxati bo\'sh.');
      return;
    }
    let text = `📋 <b>Kinolar ro'yxati (${movies.length} ta):</b>\n\n`;
    movies.forEach((m: any, i: number) => {
      text += `${i + 1}. <code>${m.code}</code> — ${m.title ?? '—'}${m.year ? ` (${m.year})` : ''}\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
};

const handleDeleteButton = async (ctx: any) => {
  adminStates.set(ctx.from.id, { type: 'delete_waiting_code' });
  await ctx.reply(
    '🗑️ <b>Kino o\'chirish</b>\n\nO\'chirmoqchi bo\'lgan kinoning kodini yuboring:\n\n📌 Misol: <code>001</code>\n\n❌ Bekor qilish uchun /admin yozing',
    { parse_mode: 'HTML' }
  );
};

const handleSubButton = async (ctx: any) => {
  const { text, keyboard } = await buildSubPanel();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
};

const handleSettingsButton = async (ctx: any) => {
  const currentChannelId = await getChannelId();
  const keyboard = new InlineKeyboard()
    .text('📡 Kanal ulash / o\'zgartirish', 'admin:settings_set_channel').row();
  if (currentChannelId) {
    keyboard.text('🗑️ Kanalni o\'chirish', 'admin:settings_remove_channel').row();
  }

  const channelText = currentChannelId
    ? `✅ Ulangan kanal: <code>${currentChannelId}</code>`
    : '⚠️ Hech qanday kanal ulanmagan.';

  await ctx.reply(
    `⚙️ <b>Sozlamalar</b>\n\n📡 <b>Kino kanali:</b>\n${channelText}\n\nKinolar shu kanaldan forward qilinadi.`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
};

const handleCloseButton = async (ctx: any) => {
  adminStates.delete(ctx.from.id);
  await ctx.reply('✅ Panel yopildi.', {
    reply_markup: { remove_keyboard: true }
  });
};

// ─── CALLBACK QUERIES ─────────────────────────────────────────────────────────

adminHandler.callbackQuery('admin:back', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.delete(ctx.from.id);
  await ctx.deleteMessage();
  await ctx.reply('🎛 <b>Admin Panel</b>\n\nQuyidagi tugmalardan birini tanlang:', {
    parse_mode: 'HTML',
    reply_markup: mainPanel
  });
});

// ─── ⚙️ SOZLAMALAR CALLBACKS ──────────────────────────────────────────────────

adminHandler.callbackQuery('admin:settings_set_channel', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'settings_waiting_channel' });
  await ctx.editMessageText(
    '📡 <b>Kino kanalini ulash</b>\n\nKanal username yoki ID sini yuboring:\n\n📌 Misol:\n<code>@mening_kino_kanal</code>\n<code>-1001234567890</code>\n\n⚠️ Agar kanal yopiq (private) bo\'lsa, uning ID sini kiritishingiz kerak. ID ni bilish uchun kanal xabarini @userinfobot ga yuboring.\n\n❌ Diqqat: Invite link (https://t.me/...) qabul qilinmaydi!\n\n⚠️ Bot shu kanalda <b>admin</b> bo\'lishi shart!\n\n❌ Bekor qilish uchun /admin yozing',
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back') }
  );
});

adminHandler.callbackQuery('admin:settings_remove_channel', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await Settings.deleteOne({ key: 'channel_id' });
    await ctx.editMessageText(
      '✅ Kanal o\'chirildi.\n\n⚙️ <b>Sozlamalar</b>\n\n📡 Kino kanali: ⚠️ Hech qanday kanal ulanmagan.',
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('📡 Kanal ulash', 'admin:settings_set_channel').row()
          .text('🔙 Orqaga', 'admin:back')
      }
    );
  } catch (err) {
    console.error(err);
    await ctx.answerCallbackQuery('❌ Xatolik yuz berdi');
  }
});

// ─── 🔒 MAJBURIY OBUNA ────────────────────────────────────────────────────────

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

adminHandler.callbackQuery('admin:sub_add', async (ctx) => {
  await ctx.answerCallbackQuery();
  adminStates.set(ctx.from.id, { type: 'sub_waiting_channel' });
  await ctx.editMessageText(
    '🔒 <b>Kanal qo\'shish</b>\n\nKanal username yoki ID sini yuboring:\n\n📌 Misol:\n<code>@mening_kanalim</code>\n<code>-1001234567890</code>\n\n⚠️ Agar kanal yopiq bo\'lsa, ID sini kiritishingiz kerak. ID ni bilish uchun kanal xabarini @userinfobot ga yuboring.\n\n❌ Diqqat: Invite link (https://t.me/...) qabul qilinmaydi!\n\n⚠️ Bot shu kanalda <b>admin</b> bo\'lishi shart!\n\n❌ Bekor qilish uchun /admin yozing',
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back') }
  );
});

adminHandler.callbackQuery(/^admin:sub_check:(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;
  const state = adminStates.get(userId);
  if (state?.type !== 'sub_waiting_check') {
    await ctx.editMessageText('❌ Amaliyot muddati tugagan.', { reply_markup: backBtn });
    return;
  }
  adminStates.delete(userId);

  const skipCheck = ctx.match[1] === 'no';
  try {
    await SubChannel.findOneAndUpdate(
      { channelId: state.channelId },
      { channelId: state.channelId, title: state.title, link: state.link, skipCheck },
      { upsert: true, new: true }
    );

    const { text: panelText, keyboard } = await buildSubPanel();
    await ctx.editMessageText(
      `✅ <b>${state.title}</b> kanali/boti muvaffaqiyatli qo'shildi!\n\n` + panelText,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  } catch (err) {
    console.error(err);
    await ctx.editMessageText('❌ Saqlashda xatolik yuz berdi.');
  }
});

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

// ─── TEXT MESSAGE HANDLER ─────────────────────────────────────────────────────
adminHandler.on('message:text', async (ctx, next) => {
  const userId = ctx.from!.id;
  const text = ctx.message.text.trim();
  const state = adminStates.get(userId);

  // --- Bottom keyboard button presses ---
  if (!state) {
    if (text === '➕ Kino qo\'shish')       { await handleAddButton(ctx); return; }
    if (text === '👥 Foydalanuvchilar')      { await handleUsersButton(ctx); return; }
    if (text === '📢 Xabar yuborish')        { await handleBroadcastButton(ctx); return; }
    if (text === '📋 Kinolar ro\'yxati')     { await handleListButton(ctx); return; }
    if (text === '🗑️ Kino o\'chirish')       { await handleDeleteButton(ctx); return; }
    if (text === '🔒 Majburiy obuna')        { await handleSubButton(ctx); return; }
    if (text === '⚙️ Sozlamalar')            { await handleSettingsButton(ctx); return; }
    if (text === '❌ Panelni yopish')        { await handleCloseButton(ctx); return; }

    // No button match and no state — pass to userHandler
    await next();
    return;
  }

  // --- Delete: waiting for code ---
  if (state.type === 'delete_waiting_code') {
    adminStates.delete(userId);
    const code = text;
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
      await ctx.reply('❌ Xatolik yuz berdi.', { reply_markup: mainPanel });
    }
    return;
  }

  // --- Broadcast: waiting for message ---
  if (state.type === 'broadcast_waiting_message') {
    adminStates.delete(userId);
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

  // --- Settings: waiting for channel ---
  if (state.type === 'settings_waiting_channel') {
    adminStates.delete(userId);
    
    if (text.includes('t.me/')) {
      await ctx.reply('❌ Noto\'g\'ri format. Iltimos, kanal <b>username</b> (<code>@kanal</code>) yoki <b>ID</b> (<code>-100...</code>) sini yuboring.\n\nInvite link (ssilka) qabul qilinmaydi. Yopiq kanal ID sini bilish uchun kanaldagi biror xabarni @userinfobot ga yuborib ko\'ring.', { parse_mode: 'HTML', reply_markup: mainPanel });
      return;
    }

    try {
      const chat = await ctx.api.getChat(text) as any;
      const channelId = String(chat.id);
      const title = chat.title || chat.username || text;

      await Settings.findOneAndUpdate(
        { key: 'channel_id' },
        { key: 'channel_id', value: channelId },
        { upsert: true, new: true }
      );

      await ctx.reply(
        `✅ Kanal muvaffaqiyatli ulandi!\n\n📡 Kanal: <b>${title}</b>\n🆔 ID: <code>${channelId}</code>\n\nEndi kinolar shu kanaldan forward qilinadi.`,
        { parse_mode: 'HTML', reply_markup: mainPanel }
      );
    } catch (err) {
      console.error(err);
      await ctx.reply(
        '❌ Kanal topilmadi yoki bot kanalda admin emas.\n\nBotni kanalga admin qilib, qaytadan urinib ko\'ring.',
        { reply_markup: mainPanel }
      );
    }
    return;
  }

  // --- Subscription: waiting for channel ---
  if (state.type === 'sub_waiting_channel') {
    adminStates.delete(userId);

    if (text.includes('t.me/')) {
      await ctx.reply('❌ Noto\'g\'ri format. Iltimos, kanal <b>username</b> (<code>@kanal</code>) yoki <b>ID</b> (<code>-100...</code>) sini yuboring.\n\nInvite link (ssilka) qabul qilinmaydi. Yopiq kanal ID sini bilish uchun kanaldagi biror xabarni @userinfobot ga yuborib ko\'ring.', { parse_mode: 'HTML', reply_markup: mainPanel });
      return;
    }

    try {
      const chat = await ctx.api.getChat(text) as any;
      const channelId = String(chat.id);
      const title = chat.title || chat.username || text;
      const username = chat.username;
      
      let defaultLink = '';
      if (username) {
        defaultLink = `https://t.me/${username}`;
      } else {
        try {
          defaultLink = await ctx.api.exportChatInviteLink(channelId);
        } catch {
          defaultLink = `https://t.me/c/${channelId.replace('-100', '')}`;
        }
      }

      adminStates.set(userId, { type: 'sub_waiting_link', channelId, title, defaultLink });
      
      await ctx.reply(
        `✅ <b>${title}</b> kanali topildi.\n\nFoydalanuvchilarga ushbu kanal uchun qanday silka (tugma) ko'rsatilsin?\n\nZayavka yoki maxsus silka bo'lsa, uni yuboring. Aks holda <b>/skip</b> buyrug'ini yozing (avtomatik silka o'rnatiladi).`,
        { parse_mode: 'HTML', reply_markup: mainPanel }
      );
    } catch (err) {
      console.error(err);
      await ctx.reply(
        '❌ Kanal topilmadi yoki bot kanalda admin emas.\n\nBotni kanalga admin qilib, qaytadan urinib ko\'ring.',
        { reply_markup: mainPanel }
      );
    }
    return;
  }

  // --- Subscription: waiting for link ---
  if (state.type === 'sub_waiting_link') {
    adminStates.delete(userId);
    let finalLink = state.defaultLink;
    
    if (text !== '/skip') {
      if (!text.startsWith('http://') && !text.startsWith('https://')) {
        await ctx.reply('❌ Noto\'g\'ri format. Silka http yoki https bilan boshlanishi kerak. Boshqatdan urinib ko\'ring.', { reply_markup: mainPanel });
        return;
      }
      finalLink = text;
    }
    
    adminStates.set(userId, { type: 'sub_waiting_check', channelId: state.channelId, title: state.title, link: finalLink });
    
    const kb = new InlineKeyboard()
      .text('✅ Ha (Qat\'iy tekshirish)', 'admin:sub_check:yes').row()
      .text('❌ Yo\'q (Faqat silkani bosish kifoya)', 'admin:sub_check:no');

    await ctx.reply(
      `❓ <b>${state.title}</b> bot/kanaliga a'zolik qat'iy tekshirilsinmi?\n\n(Agar bu BOT bo'lsa, "Yo'q" tugmasini bosing, chunki bot obunasini Telegram orqali tekshirib bo'lmaydi!)`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return;
  }

  // Fallback
  await next();
});

// ─── VIDEO HANDLER ────────────────────────────────────────────────────────────
adminHandler.on('message:video', async (ctx, next) => {
  const userId = ctx.from!.id;
  const state = adminStates.get(userId);
  const msg = ctx.message;
  const video = msg.video;

  // ── Case 1: Forward from channel — auto-index using caption ──────────────
  const msgAny = msg as any;
  if (!state && (msgAny.forward_origin || msgAny.forward_from_chat || msgAny.forward_date)) {
    const rawCaption = msg.caption || '';
    const lines = rawCaption.split('\n').map((l: string) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      await ctx.reply('⚠️ Forward qilingan videoda caption (kod) yo\'q. Kino saqlanmadi.', { reply_markup: mainPanel });
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
    const fileId = video.file_id;
    const forwardChatId = msgAny.forward_from_chat?.id;
    const messageId = msgAny.forward_from_message_id || msg.message_id;

    try {
      await Movie.findOneAndUpdate(
        { code },
        { code, title, year, caption, fileId, messageId, channelId: forwardChatId || undefined },
        { upsert: true, new: true }
      );
      await ctx.reply(
        `✅ <b>Kino saqlandi!</b>\n\n📌 Kod: <code>${code}</code>\n🎬 Nomi: <b>${title ?? '—'}</b>${year ? `\n📅 Yil: ${year}` : ''}`,
        { parse_mode: 'HTML', reply_markup: mainPanel }
      );
    } catch (err: any) {
      if (err.code === 11000) {
        await ctx.reply(`⚠️ <b>${code}</b> kodli kino yangilandi!`, { parse_mode: 'HTML', reply_markup: mainPanel });
      } else {
        console.error(err);
        await ctx.reply('❌ Saqlashda xatolik yuz berdi.', { reply_markup: mainPanel });
      }
    }
    return;
  }

  // ── Case 2: Waiting for video after /add command ─────────────────────────
  if (state?.type !== 'add_waiting_video') {
    await next();
    return;
  }

  adminStates.delete(userId);
  const fileId = video.file_id;

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
    await ctx.reply('❌ Format: <code>/add [kod] [nomi] [yil]</code>', { parse_mode: 'HTML' });
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
