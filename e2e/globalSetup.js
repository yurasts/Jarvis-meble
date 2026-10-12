import { createServer } from 'vite';

export default async function globalSetup() {
  globalThis.process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  globalThis.process.env.VITE_SUPABASE_ANON_KEY = 'e2e-anon-key';

  const server = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  });
  await server.listen();

  return async () => {
    await server.close();
  };
}
