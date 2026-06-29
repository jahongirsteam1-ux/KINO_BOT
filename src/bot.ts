import 'dotenv/config';
import { Bot } from 'grammy';
import { connectDB } from './db';
import { userHandler } from './handlers/user';
import { adminHandler } from './handlers/admin';

// Initialize the bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not defined in environment variables.');
  process.exit(1);
}
const bot = new Bot(token);

// Register handlers
// Note: adminHandler should preferably be registered before userHandler 
// so that admin commands take precedence if needed, but since they have distinct commands, it's mostly fine.
bot.use(adminHandler);
bot.use(userHandler);

// Handle errors
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  console.error(e);
});

// Start the bot
const startBot = async () => {
  await connectDB();
  console.log('🤖 Bot is starting...');
  bot.start();
};

startBot();
