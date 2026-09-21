import path from 'node:path';
import { config } from 'dotenv';

// Load monorepo root .env then package-local overrides.
config({ path: path.resolve(__dirname, '../../../../.env') });
config({ path: path.resolve(__dirname, '../../../.env') });
config();
