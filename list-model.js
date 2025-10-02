import 'dotenv/config';
import { GoogleGenerativeAI, listModels } from "@google/generative-ai";

(async () => {
  try {
    const models = await listModels({ apiKey: process.env.GOOGLE_API_KEY });
    console.log(JSON.stringify(models, null, 2));
  } catch (e) {
    console.error('listModels error:', e?.message || e);
  }
})();
