import { Composer } from 'grammy';
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

// Middleware to silently ignore non-admins for all admin commands
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

// In-memory Map to store pending add state per admin user
const pendingAdds = new Map<number, PendingMovie>();

adminHandler.command('add', async (ctx) => {
  const args = ctx.match;
  if (!args) {
    await ctx.reply('Iltimos, kod, sarlavha va yilni kiriting. Masalan: /add 001 Inception 2010');
    return;
  }

  // Split arguments, handling possible spaces in the title (simplified approach)
  // A better approach would parse quotes, but let's assume space separation: /add <code> <title parts...> [year]
  // The instructions specify: /add [code] [title] [year(optional)]
  // We'll use a regex to extract code, and remaining text.
  
  // Try to parse format: code title year
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply('❌ Kamida 2 ta argument kerak: kod va sarlavha. Masalan: /add 001 Inception');
    return;
  }

  const code = parts[0];
  let year: number | undefined;
  let titleParts = parts.slice(1);

  // Check if the last part is a year (4 digits)
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
  await ctx.reply(`Yaxshi! Endi kino videosini yuboring.\nKod: ${code}\nSarlavha: ${title}${year ? `\nYil: ${year}` : ''}`);
});

adminHandler.on('message:video', async (ctx) => {
  const userId = ctx.from!.id;
  const pending = pendingAdds.get(userId);

  if (!pending) {
    // If admin sends a video but has no pending state, we don't do anything special here.
    // However, it might trigger the userHandler if we are not careful.
    // The instructions say "video handler must only trigger if admin has pending state"
    // Since we are in Composer, it will handle it if we return next(), or just return.
    return;
  }

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
    await ctx.reply(`✅ Kino muvaffaqiyatli qo'shildi!\nKod: ${pending.code}`);
  } catch (error: any) {
    if (error.code === 11000) {
      await ctx.reply(`❌ Xatolik: ${pending.code} kodi bilan kino allaqachon mavjud.`);
    } else {
      console.error('Error saving movie:', error);
      await ctx.reply('❌ Kinoni saqlashda xatolik yuz berdi.');
    }
  }
});

adminHandler.command('delete', async (ctx) => {
  const code = ctx.match.trim();
  if (!code) {
    await ctx.reply('Iltimos, o\'chirish uchun kino kodini kiriting. Masalan: /delete 001');
    return;
  }

  try {
    const result = await Movie.findOneAndDelete({ code });
    if (result) {
      await ctx.reply(`✅ ${code} kodli kino muvaffaqiyatli o'chirildi.`);
    } else {
      await ctx.reply(`❌ ${code} kodli kino topilmadi.`);
    }
  } catch (error) {
    console.error('Error deleting movie:', error);
    await ctx.reply('❌ Kinoni o\'chirishda xatolik yuz berdi.');
  }
});

adminHandler.command('list', async (ctx) => {
  try {
    const movies = await Movie.find().sort({ addedAt: -1 }).limit(50);
    
    if (movies.length === 0) {
      await ctx.reply('Kino ro\'yxati bo\'sh.');
      return;
    }

    let response = '🎬 <b>So\'nggi qo\'shilgan kinolar (top 50):</b>\n\n';
    movies.forEach(movie => {
      response += `<code>${movie.code}</code> — ${movie.title} ${movie.year ? `(${movie.year})` : ''}\n`;
    });

    await ctx.reply(response, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error listing movies:', error);
    await ctx.reply('❌ Ro\'yxatni olishda xatolik yuz berdi.');
  }
});
