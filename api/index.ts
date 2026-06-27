// Vercel serverless entry — catches all /api/* requests and passes them to Express
import { createApp } from '../server/src/app';

const app = createApp();

export default app;
