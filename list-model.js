import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
(async () => {
  const models = await genAI.listModels();
  console.log(models);
})();
