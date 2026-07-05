import cron from 'node-cron';
import { Bot } from 'grammy';
import { AutoMessage } from './models/AutoMessage';
import { User } from './models/User';

export const setupCronJobs = (bot: Bot) => {
  // Har kuni soat 10:00, 15:00 va 20:00 da (Toshkent vaqti bilan) ishga tushadi
  // Note: timezone configuration is recommended, but Railway might run on UTC.
  // Assuming Railway is UTC, 10:00 UZT is 05:00 UTC. 15:00 UZT is 10:00 UTC. 20:00 UZT is 15:00 UTC.
  // But let's just use timezone parameter directly to avoid confusion.
  cron.schedule('0 10,15,20 * * *', async () => {
    console.log('⏰ Auto-broadcast cron triggered!');
    try {
      // 1. Eng avvalo yangi (hali yuborilmagan) xabarni qidiramiz
      let msg = await AutoMessage.findOne({ lastSentAt: { $exists: false } }).sort({ addedAt: 1 });
      
      if (!msg) {
        msg = await AutoMessage.findOne({ lastSentAt: null }).sort({ addedAt: 1 });
      }

      // 2. Agar yangi xabar qolmagan bo'lsa, mavjudlaridan tasodifiysini tanlaymiz
      if (!msg) {
        const count = await AutoMessage.countDocuments();
        if (count === 0) {
          console.log('Hech qanday avto-xabar topilmadi.');
          return;
        }
        const random = Math.floor(Math.random() * count);
        msg = await AutoMessage.findOne().skip(random);
      }

      if (!msg) return; // For TypeScript type safety

      console.log(`Avto-xabar (ID: ${msg._id}) tarqatish boshlandi...`);

      const getAdminIds = (): number[] => {
        const raw = process.env.ADMIN_IDS || '';
        return raw.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      };
      const adminIds = getAdminIds();

      const users = await User.find({ telegramId: { $nin: adminIds } }, 'telegramId');
      let sent = 0, failed = 0;

      for (const user of users) {
        try {
          await bot.api.copyMessage(user.telegramId, msg.fromChatId, msg.messageId);
          sent++;
        } catch (err) {
          failed++;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      console.log(`Avto-tarqatma yakunlandi: Yuborildi ${sent}, Xato ${failed}`);
      
      // Xabarni keyingi safar eng oxirida yuborilishi uchun lastSentAt yangilaymiz
      msg.lastSentAt = new Date();
      await msg.save();
    } catch (err) {
      console.error('Auto-broadcast cron error:', err);
    }
  }, {
    timezone: 'Asia/Tashkent'
  });

  // Nofaol foydalanuvchilarni qaytarish (Har kuni soat 12:00 da)
  cron.schedule('0 12 * * *', async () => {
    console.log('⏰ Re-engagement cron triggered!');
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const getAdminIds = (): number[] => {
        const raw = process.env.ADMIN_IDS || '';
        return raw.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      };
      const adminIds = getAdminIds();

      const inactiveUsers = await User.find({
        telegramId: { $nin: adminIds },
        lastActivityAt: { $lt: oneDayAgo },
        $or: [
          { lastReEngagedAt: null },
          { lastReEngagedAt: { $exists: false } },
          { lastReEngagedAt: { $lt: oneDayAgo } }
        ]
      });

      if (inactiveUsers.length === 0) return;

      const { InlineKeyboard } = await import('grammy');
      
      const templates = [
        {
          text: "Siz uchun eng zo'r yangi kinolarni yuklayapmiz! 🍿 Botimizdagi kinolar sizga yoqyaptimi?",
          kb: new InlineKeyboard().text("Ha, albatta! 👍", "reengage:yes").text("Yo'q 👎", "reengage:no")
        },
        {
          text: "Ko'pdan beri botga kirmadingiz... 😔 Kino topishda qiynalyapsizmi?",
          kb: new InlineKeyboard().text("Hammasi tushunarli 👍", "reengage:yes").text("Qiynalyapman 👎", "reengage:no")
        }
      ];

      for (const user of inactiveUsers) {
        const randomTpl = templates[Math.floor(Math.random() * templates.length)];
        try {
          await bot.api.sendMessage(user.telegramId, randomTpl.text, { reply_markup: randomTpl.kb });
          
          user.lastReEngagedAt = new Date();
          await user.save();
        } catch (err) {
          // ignore block errors
        }
        await new Promise(r => setTimeout(r, 50));
      }
      
      console.log(`Re-engagement yakunlandi. Yuborildi: ${inactiveUsers.length}`);
    } catch (err) {
      console.error('Re-engagement cron error:', err);
    }
  }, {
    timezone: 'Asia/Tashkent'
  });
};
