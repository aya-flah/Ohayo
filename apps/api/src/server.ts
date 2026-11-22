import 'dotenv/config';
import { buildApp } from './app';

const app = await buildApp();
const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
