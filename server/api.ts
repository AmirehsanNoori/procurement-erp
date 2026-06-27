// Vercel serverless entry point.
// Wraps the Express app so Vercel can run it as a serverless function.
// vercel.json routes /api/* to this file.
import { createApp } from './src/app';

const app = createApp();

export default app;
