import os from 'node:os';
import path from 'node:path';

process.env.DB_FILE ||= path.join(os.tmpdir(), 'arzon.db');
