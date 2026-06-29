import { Composer, InlineKeyboard } from 'grammy';
import { Movie } from '../models/Movie';

export const adminHandler = new Composer();

// Helper to check if a user is an admin
const getAdminIds = (): number[] => {
  const adminIdsStr = process.env.ADMIN_IDS || '';
  return adminIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
};

const isAdmin = (userId: number): boolean => {
  return getAdminIds().includes(userId);
};

// Middleware to silently ignore non-admins
adminHandler.use(async (ctx, next) => {
  if (ctx.from && isAdmin(ctx.from.id)) {
    await next();
  }
});

interface PendingMovie {
  code: string;
  title: string;
  year?: number;
}

interface PendingDelete {
  waitingCode: boolean;
}

// In-memory Maps
const pendingAdds = new Map<number, PendingMovie>();
const pendingDeletes = new Map<number, PendingDelete>();

// Admin Panel inline keyboard
const adminKeyboard = new InlineKeyboard()
  .text('➕ Kino qo\'shish', 'admin:add')
  .text('🗑️ Kino o\'chirish', 'admin:delete')
  .row()
  .text('📋 Ro\'yxat', 'admin:list')
  .text('❌ Yopish', 'admin:close');

// /panel command → show admin panel
adminHandler.command('panel', async (ctx) => {
  await ctx.reply(
    '🎬 <b>Admin Panel</b>\n\nQuyidagi amallardan birini tanlang:',
    { parse_mode: 'HTML', reply_markup: adminKeyboard }
  );
});

// ─── CALLBACK QUERY HANDLERS ─────────────────────────────────────────────────

// ➕ Kino qo'shish tugmasi bosilganda
adminHandler.callbackQuery('admin:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    '➕ <b>Kino qo\'shish</b>\n\nQuyidagi formatda yozing:\n<code>/add [kod] [nomi] [yil]</code>\n\nMasalan:\n<code>/add 001 Inception 2010</code>',
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back') }
  );
});

// 🗑️ Kino o'chirish tugmasi bosilganda
adminHandler.callbackQuery('admin:delete', async (ctx) => {
  await ctx.answerCallbackQuery();
  pendingDeletes.set(ctx.from.id, { waitingCode: true });
  await ctx.editMessageText(
    '🗑️ <b>Kino o\'chirish</b>\n\nO\'chirmoqchi bo\'lgan kinoning <b>kodini</b> yuboring:\n\nMasalan: <code>001</code>',
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back') }
  );
});

// 📋 Ro'yxat tugmasi bosilganda
adminHandler.callbackQuery('admin:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    if (movies.length === 0) {
      await ctx.editMessageText(
        '📋 <b>Kinolar ro\'yxati</b>\n\nHech qanday kino topilmadi.',
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back') }
      );
      return;
    }
    let response = `📋 <b>Kinolar ro'yxati (${movies.length} ta):</b>\n\n`;
    movies.forEach((movie, i) => {
      response += `${i + 1}. <code>${movie.code}</code> — ${movie.title} ${movie.year ? `(${movie.year})` : ''}\n`;
    });
    await ctx.editMessageText(response, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back')
    });
  } catch (error) {
    console.error('Error listing movies:', error);
    await ctx.editMessageText('❌ Ro\'yxatni olishda xatolik yuz berdi.', {
      reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'admin:back')
    });
  }
});

// 🔙 Orqaga tugmasi
adminHandler.callbackQuery('admin:back', async (ctx) => {
  await ctx.answerCallbackQuery();
  pendingDeletes.delete(ctx.from.id);
  await ctx.editMessageText(
    '🎬 <b>Admin Panel</b>\n\nQuyidagi amallardan birini tanlang:',
    { parse_mode: 'HTML', reply_markup: adminKeyboard }
  );
});

// ❌ Yopish tugmasi
adminHandler.callbackQuery('admin:close', async (ctx) => {
  await ctx.answerCallbackQuery('Panel yopildi.');
  await ctx.deleteMessage();
});

// ─── COMMAND HANDLERS ─────────────────────────────────────────────────────────

// /add [code] [title] [year(optional)]
adminHandler.command('add', async (ctx) => {
  const args = ctx.match;
  if (!args) {
    await ctx.reply('❌ Format: /add [kod] [nomi] [yil]\nMasalan: /add 001 Inception 2010');
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply('❌ Kamida 2 ta argument kerak: kod va sarlavha.\nMasalan: /add 001 Inception');
    return;
  }

  const code = parts[0];
  let year: number | undefined;
  let titleParts = parts.slice(1);

  const lastPart = parts[parts.length - 1];
  if (/^\d{4}$/.test(lastPart)) {
    year = parseInt(lastPart);
    titleParts = parts.slice(1, -1);
  }

  const title = titleParts.join(' ');
  if (!title) {
    await ctx.reply('❌ Sarlavha bo\'sh bo\'lishi mumkin emas.');
    return;
  }

  pendingAdds.set(ctx.from!.id, { code, title, year });
  await ctx.reply(
    `✅ Ma'lumotlar qabul qilindi!\n\n📌 Kod: <code>${code}</code>\n🎬 Nomi: <b>${title}</b>${year ? `\n📅 Yil: ${year}` : ''}\n\nEndi kino videosini yuboring:`,
    { parse_mode: 'HTML' }
  );
});

// Message:text → pending delete handler
adminHandler.on('message:text', async (ctx) => {
  const userId = ctx.from!.id;
  const pendingDelete = pendingDeletes.get(userId);

  if (pendingDelete?.waitingCode) {
    const code = ctx.message.text.trim();
    pendingDeletes.delete(userId);
    try {
      const result = await Movie.findOneAndDelete({ code });
      if (result) {
        await ctx.reply(
          `✅ <b>${code}</b> kodli "<b>${result.title}</b>" kino muvaffaqiyatli o'chirildi.`,
          { parse_mode: 'HTML', reply_markup: adminKeyboard }
        );
      } else {
        await ctx.reply(
          `❌ <b>${code}</b> kodli kino topilmadi.`,
          { parse_mode: 'HTML', reply_markup: adminKeyboard }
        );
      }
    } catch (error) {
      console.error('Error deleting movie:', error);
      await ctx.reply('❌ Kinoni o\'chirishda xatolik yuz berdi.');
    }
  }
});

// Message:video → pending add handler
adminHandler.on('message:video', async (ctx) => {
  const userId = ctx.from!.id;
  const pending = pendingAdds.get(userId);

  if (!pending) return;

  const fileId = ctx.message.video.file_id;

  try {
    const movie = new Movie({
      code: pending.code,
      fileId: fileId,
      title: pending.title,
      year: pending.year
    });

    await movie.save();
    pendingAdds.delete(userId);
    await ctx.reply(
      `✅ Kino muvaffaqiyatli qo'shildi!\n\n📌 Kod: <code>${pending.code}</code>\n🎬 Nomi: <b>${pending.title}</b>${pending.year ? `\n📅 Yil: ${pending.year}` : ''}`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard }
    );
  } catch (error: any) {
    if (error.code === 11000) {
      await ctx.reply(`❌ <b>${pending.code}</b> kodi bilan kino allaqachon mavjud.`, { parse_mode: 'HTML' });
    } else {
      console.error('Error saving movie:', error);
      await ctx.reply('❌ Kinoni saqlashda xatolik yuz berdi.');
    }
  }
});

// /delete [code]
adminHandler.command('delete', async (ctx) => {
  const code = ctx.match.trim();
  if (!code) {
    await ctx.reply('❌ Format: /delete [kod]\nMasalan: /delete 001');
    return;
  }
  try {
    const result = await Movie.findOneAndDelete({ code });
    if (result) {
      await ctx.reply(`✅ <b>${code}</b> kodli kino o'chirildi.`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`❌ <b>${code}</b> kodli kino topilmadi.`, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Error deleting movie:', error);
    await ctx.reply('❌ Kinoni o\'chirishda xatolik yuz berdi.');
  }
});

// /list
adminHandler.command('list', async (ctx) => {
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    if (movies.length === 0) {
      await ctx.reply('Kino ro\'yxati bo\'sh.');
      return;
    }
    let response = `📋 <b>Kinolar ro'yxati (${movies.length} ta):</b>\n\n`;
    movies.forEach((movie, i) => {
      response += `${i + 1}. <code>${movie.code}</code> — ${movie.title} ${movie.year ? `(${movie.year})` : ''}\n`;
    });
    await ctx.reply(response, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error listing movies:', error);
    await ctx.reply('❌ Ro\'yxatni olishda xatolik yuz berdi.');
  }
});
