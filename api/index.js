import '../server/vercel-env.js';
import { app } from '../server/index.js';
import { seedIfEmpty } from '../server/seed.js';

seedIfEmpty();
export default app;
