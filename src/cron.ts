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
      // Eng oxirgi yuborilgan vaqti bo'yicha saralab eng eskisini olish
      const msg = await AutoMessage.findOne().sort({ lastSentAt: 1, addedAt: 1 });
      
      if (!msg) {
        console.log('Hech qanday avto-xabar topilmadi.');
        return;
      }

      console.log(`Avto-xabar (ID: ${msg._id}) tarqatish boshlandi...`);

      const users = await User.find({}, 'telegramId');
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
};
