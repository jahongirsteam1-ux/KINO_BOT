import { Composer } from 'grammy';
import { Movie } from '../models/Movie';
import { User } from '../models/User';

export const userHandler = new Composer();

// Save user to DB helper
const saveUser = async (ctx: any) => {
  if (!ctx.from) return;
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      {
        telegramId: ctx.from.id,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    // silently ignore
  }
};

userHandler.command('start', async (ctx) => {
  await saveUser(ctx);
  await ctx.reply(
    `👋 Salom, <b>${ctx.from?.first_name ?? 'Foydalanuvchi'}</b>!\n\n🎬 Menga kino kodini yuboring va men sizga kinoni yuboraman.\n\nMasalan: <code>001</code>`,
    { parse_mode: 'HTML' }
  );
});

userHandler.on('message:text', async (ctx) => {
  await saveUser(ctx);
  const code = ctx.message.text.trim();

  try {
    const movie = await Movie.findOne({ code });
    if (!movie) {
      await ctx.reply('❌ Bu kodda kino topilmadi.');
      return;
    }

    let caption = `🎬 <b>${movie.title}</b>`;
    if (movie.year) caption += ` (${movie.year})`;
    if (movie.caption) caption += `\n\n${movie.caption}`;

    await ctx.replyWithVideo(movie.fileId, { caption, parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error fetching movie:', error);
    await ctx.reply('Kechirasiz, xatolik yuz berdi.');
  }
});
