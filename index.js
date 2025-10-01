import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
// Import versi SDK untuk diagnosa
import pkg from '@google/generative-ai/package.json' assert { type: 'json' };

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PREFERRED_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest'; // preferensi

if (!TELEGRAM_BOT_TOKEN) throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
if (!GOOGLE_API_KEY) throw new Error('Missing GOOGLE_API_KEY in .env');

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// Log versi SDK untuk memastikan yang terpakai
console.log('Using @google/generative-ai version:', pkg.version);

function chunkText(text, chunkSize = 3800) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

// Resolve model yang tersedia berdasarkan API key user.
// Prioritas: 1.5 pro → 1.5 flash → legacy gemini-pro.
let RESOLVED_MODEL = null;
async function resolveAvailableModel() {
  try {
    const list = await genAI.listModels();
    const names = (list?.models || list || []).map(m => (m.name || '').replace(/^models\//, '')).filter(Boolean);

    const candidates = [
      PREFERRED_MODEL,
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro' // legacy fallback
    ];

    const found = candidates.find(c => names.includes(c) || names.includes(`models/${c}`));
    if (found) {
      RESOLVED_MODEL = found;
      console.log('Resolved model:', RESOLVED_MODEL);
      return RESOLVED_MODEL;
    }

    // Jika tidak ada kandidat di atas, pilih model pertama yang mendukung generateContent.
    const any = (list?.models || list || []).find(m => (m.supportedGenerationMethods || []).includes('generateContent'));
    if (any?.name) {
      RESOLVED_MODEL = any.name.replace(/^models\//, '');
      console.log('Resolved model (first available):', RESOLVED_MODEL);
      return RESOLVED_MODEL;
    }

    throw new Error('No available model supports generateContent for this API key.');
  } catch (e) {
    console.error('Failed to list models:', e?.message || e);
    // Sebagai fallback terakhir, coba legacy
    RESOLVED_MODEL = 'gemini-pro';
    console.log('Fallback to model:', RESOLVED_MODEL);
    return RESOLVED_MODEL;
  }
}

async function generateWithModel(modelName, prompt) {
  const activeModel = genAI.getGenerativeModel({ model: modelName });
  const result = await activeModel.generateContent([
    { text: 'Kamu adalah asisten yang membantu dan ringkas.' },
    { text: prompt },
  ]);
  const response = await result.response;
  // SDK 0.24.x menyediakan response.text()
  const output = typeof response.text === 'function' ? response.text() : (response.text || 'Maaf, tidak ada respons.');
  return output;
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (!RESOLVED_MODEL) await resolveAvailableModel();

  const welcome =
    'Halo! 🤖\n' +
    'Saya bot AI berbasis Google Gemini.\n\n' +
    'Kirim pertanyaan atau topik apa pun, saya akan membalas dengan jawaban AI.\n' +
    `Model preferensi: ${PREFERRED_MODEL}\n` +
    `Model aktif: ${RESOLVED_MODEL}\n\n` +
    'Perintah:\n' +
    '/model_flash — pakai gemini-1.5-flash-latest (jika tersedia)\n' +
    '/model_pro — pakai gemini-1.5-pro-latest (jika tersedia)\n';
  await bot.sendMessage(chatId, welcome);
});

bot.onText(/\/model_flash/, async (msg) => {
  process.env.GEMINI_MODEL = 'gemini-1.5-flash-latest';
  RESOLVED_MODEL = null;
  await resolveAvailableModel();
  await bot.sendMessage(msg.chat.id, `Model aktif: ${RESOLVED_MODEL} ✅`);
});

bot.onText(/\/model_pro/, async (msg) => {
  process.env.GEMINI_MODEL = 'gemini-1.5-pro-latest';
  RESOLVED_MODEL = null;
  await resolveAvailableModel();
  await bot.sendMessage(msg.chat.id, `Model aktif: ${RESOLVED_MODEL} ✅`);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) return;

  bot.sendChatAction(chatId, 'typing').catch(() => {});

  try {
    if (!RESOLVED_MODEL) await resolveAvailableModel();
    const modelToUse = RESOLVED_MODEL || PREFERRED_MODEL;

    let output;
    try {
      output = await generateWithModel(modelToUse, text);
    } catch (err) {
      // Jika 404 / v1beta not found, coba fallback otomatis
      const is404 = err?.status === 404 || /not found/i.test(err?.message || '');
      if (is404) {
        console.warn(`Model ${modelToUse} gagal (404). Mencoba fallback...`);
        // urutan fallback
        const fallbacks = ['gemini-1.5-flash-latest', 'gemini-pro'];
        for (const fb of fallbacks) {
          try {
            output = await generateWithModel(fb, text);
            RESOLVED_MODEL = fb;
            console.log('Switched model to:', fb);
            break;
          } catch {}
        }
        if (!output) throw err;
      } else {
        throw err;
      }
    }

    const parts = chunkText(output);
    for (const part of parts) {
      await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' }).catch(async () => {
        await bot.sendMessage(chatId, part);
      });
    }
  } catch (err) {
    console.error('AI error:', err);
    const message = typeof err?.message === 'string' ? err.message : 'Terjadi kesalahan saat memproses permintaan.';
    await bot.sendMessage(chatId, `❌ ${message}\n\nTips: Coba /model_flash atau gunakan API key AI Studio yang sudah enable Gemini 1.5.`);
  }
});

console.log('Bot is running... 🚀');
