import { Composer } from 'grammy';
import { Movie } from '../models/Movie';

export const userHandler = new Composer();

userHandler.command('start', async (ctx) => {
  await ctx.reply('Assalomu alaykum! Menga kino kodini yuboring, men sizga kinoni yuboraman.');
});

userHandler.on('message:text', async (ctx) => {
  const code = ctx.message.text.trim();
  
  try {
    const movie = await Movie.findOne({ code });
    if (!movie) {
      await ctx.reply('❌ Bu kodda kino topilmadi');
      return;
    }

    let caption = `🎬 ${movie.title}`;
    if (movie.year) {
      caption += ` (${movie.year})`;
    }
    if (movie.caption) {
      caption += `\n\n${movie.caption}`;
    }

    await ctx.replyWithVideo(movie.fileId, { caption });
  } catch (error) {
    console.error('Error fetching movie:', error);
    await ctx.reply('Kechirasiz, xatolik yuz berdi.');
  }
});
