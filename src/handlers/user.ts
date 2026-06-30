import { Composer, InlineKeyboard } from 'grammy';
import { Movie } from '../models/Movie';
import { User } from '../models/User';
import { SubChannel, ISubChannel } from '../models/SubChannel';

export const userHandler = new Composer();

// ─── Save user to DB ──────────────────────────────────────────────────────────
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
  } catch (_) { /* silently ignore */ }
};

// ─── Check subscriptions ──────────────────────────────────────────────────────
// Returns empty array if all subscribed, otherwise list of unsubscribed channels
const checkSubscriptions = async (ctx: any, userId: number): Promise<ISubChannel[]> => {
  const channels = await SubChannel.find();
  if (channels.length === 0) return [];

  const userDoc = await User.findOne({ telegramId: userId });
  const passedChannels = userDoc?.passedChannels || [];

  const notSubscribed: ISubChannel[] = [];
  for (const channel of channels) {
    if (channel.skipCheck) {
      if (!passedChannels.includes(channel.channelId)) {
        notSubscribed.push(channel);
      }
      continue;
    }

    try {
      const member = await ctx.api.getChatMember(channel.channelId, userId);
      if (['left', 'kicked'].includes(member.status)) {
        notSubscribed.push(channel);
      }
    } catch (_) {
      notSubscribed.push(channel); // assume not subscribed on error
    }
  }
  return notSubscribed;
};

// ─── Build "please subscribe" message ─────────────────────────────────────────
const sendSubscribePrompt = async (ctx: any, channels: ISubChannel[]) => {
  const keyboard = new InlineKeyboard();
  channels.forEach(ch => {
    keyboard.url(`📢 ${ch.title}`, ch.link).row();
  });
  keyboard.text('✅ Obuna bo\'ldim, tekshir!', 'check:subscription');

  await ctx.reply(
    '⚠️ <b>Kinoni olish uchun quyidagi kanallarga obuna bo\'lishingiz kerak:</b>\n\nObuna bo\'lgandan so\'ng <b>✅ Obuna bo\'ldim, tekshir!</b> tugmasini bosing.',
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
};

// ─── /start ───────────────────────────────────────────────────────────────────
userHandler.command('start', async (ctx) => {
  await saveUser(ctx);
  
  const userId = ctx.from!.id;
  const notSubscribed = await checkSubscriptions(ctx, userId);
  
  if (notSubscribed.length > 0) {
    await sendSubscribePrompt(ctx, notSubscribed);
    return;
  }

  await ctx.reply(
    `👋 Salom, <b>${ctx.from?.first_name ?? 'Foydalanuvchi'}</b>!\n\n🎬 Kino kodini yuboring va men sizga kinoni yuboraman.\n\nMasalan: <code>001</code>`,
    { parse_mode: 'HTML' }
  );
});

// ─── Check subscription callback ─────────────────────────────────────────────
userHandler.callbackQuery('check:subscription', async (ctx) => {
  await ctx.answerCallbackQuery('Tekshirilmoqda...');
  const userId = ctx.from.id;

  // Mark skipCheck channels as passed when the user clicks the check button
  const dummyChannels = await SubChannel.find({ skipCheck: true });
  if (dummyChannels.length > 0) {
    const channelIds = dummyChannels.map(c => c.channelId);
    await User.findOneAndUpdate(
      { telegramId: userId },
      { $addToSet: { passedChannels: { $each: channelIds } } }
    );
  }

  const notSubscribed = await checkSubscriptions(ctx, userId);

  if (notSubscribed.length === 0) {
    await ctx.editMessageText(
      '✅ <b>Rahmat! Siz barcha kanallarga obuna bo\'ldingiz.</b>\n\nEndi kino kodini yuboring:',
      { parse_mode: 'HTML' }
    );
  } else {
    // Still not subscribed — rebuild prompt
    const keyboard = new InlineKeyboard();
    notSubscribed.forEach(ch => {
      keyboard.url(`📢 ${ch.title}`, ch.link).row();
    });
    keyboard.text('✅ Obuna bo\'ldim, tekshir!', 'check:subscription');

    await ctx.editMessageText(
      '❌ <b>Siz hali quyidagi kanallarga obuna bo\'lmadingiz:</b>\n\nIltimos, barcha kanallarga obuna bo\'ling va qaytadan tekshiring.',
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  }
});

// ─── Movie search (message:text) ─────────────────────────────────────────────
userHandler.on('message:text', async (ctx) => {
  await saveUser(ctx);
  const code = ctx.message.text.trim();
  const userId = ctx.from!.id;

  try {
    // 1. Check subscriptions first
    const notSubscribed = await checkSubscriptions(ctx, userId);
    if (notSubscribed.length > 0) {
      await sendSubscribePrompt(ctx, notSubscribed);
      return;
    }

    // 2. Find movie
    const movie = await Movie.findOne({ code });
    if (!movie) {
      await ctx.reply('❌ Bu kodda kino topilmadi.');
      return;
    }

    // 3. Send movie via fileId with inline button
    let caption = movie.title ? `🎬 <b>${movie.title}</b>` : '';
    if (movie.year && caption) caption += ` (${movie.year})`;
    
    if (movie.caption) {
      if (caption) {
        caption += `\n\n${movie.caption}`;
      } else {
        caption = movie.caption;
      }
    }
    
    if (!caption) caption = '🎬';

    const keyboard = new InlineKeyboard().url("🎬 Do'stlarga ulashish / Botga kirish", 'https://t.me/UzFilmchi_bot');

    await ctx.replyWithVideo(movie.fileId, {
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error fetching movie:', error);
    await ctx.reply('Kechirasiz, xatolik yuz berdi.');
  }
});
