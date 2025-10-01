import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // cepat & hemat. Alternatif: 'gemini-1.5-pro'

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
}
if (!GOOGLE_API_KEY) {
  throw new Error('Missing GOOGLE_API_KEY in .env');
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

function chunkText(text, chunkSize = 3800) {
  // Telegram text limit ~4096 chars. Sisakan margin untuk markup.
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcome =
    'Halo! 🤖\n' +
    'Saya bot AI berbasis Google Gemini.\n\n' +
    'Kirimkan pertanyaan atau topik apa pun, saya akan membalas dengan jawaban AI.\n' +
    `Model saat ini: ${GEMINI_MODEL}\n\n` +
    'Perintah:\n' +
    '/model_flash — pakai gemini-1.5-flash (lebih cepat)\n' +
    '/model_pro — pakai gemini-1.5-pro (lebih cerdas, mungkin lebih lambat)\n';
  await bot.sendMessage(chatId, welcome);
});

bot.onText(/\/model_flash/, async (msg) => {
  const chatId = msg.chat.id;
  process.env.GEMINI_MODEL = 'gemini-1.5-flash';
  await bot.sendMessage(chatId, 'Model di-set ke gemini-1.5-flash ✅\nMulai kirim pesanmu.');
});

bot.onText(/\/model_pro/, async (msg) => {
  const chatId = msg.chat.id;
  process.env.GEMINI_MODEL = 'gemini-1.5-pro';
  await bot.sendMessage(chatId, 'Model di-set ke gemini-1.5-pro ✅\nMulai kirim pesanmu.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  // Abaikan command (sudah ditangani di handler /start, /model_*)
  if (!text || text.startsWith('/')) return;

  // Indikasi mengetik
  bot.sendChatAction(chatId, 'typing').catch(() => {});

  try {
    const currentModel = process.env.GEMINI_MODEL || GEMINI_MODEL;
    const activeModel = genAI.getGenerativeModel({ model: currentModel });

    // Prompt dasar. Kamu bisa menambahkan instruction sistem di sini.
    const prompt = text;

    const result = await activeModel.generateContent([
      { text: 'Kamu adalah asisten yang membantu dan ringkas.' },
      { text: prompt },
    ]);

    const response = await result.response;
    const output = response.text?.() || 'Maaf, tidak ada respons. Coba lagi.';

    const parts = chunkText(output);
    for (const part of parts) {
      await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' }).catch(async () => {
        // Jika gagal parse Markdown (karena karakter khusus), kirim plain text
        await bot.sendMessage(chatId, part);
      });
    }
  } catch (err) {
    console.error('AI error:', err);
    const message = typeof err?.message === 'string' ? err.message : 'Terjadi kesalahan saat memproses permintaan.';
    await bot.sendMessage(chatId, `❌ ${message}`);
  }
});

console.log('Bot is running... 🚀');
