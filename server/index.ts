import 'dotenv/config';
import { createApp } from './app';

const production = process.argv.includes('--production');
const port = Number(process.env.CV_API_PORT || 3001);
const server = createApp(production).listen(port, '127.0.0.1', () => {
  console.log(`CV ${production ? 'studio' : 'API'} ready at http://127.0.0.1:${port}`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is in use. Set CV_API_PORT in .env and try again.`
      : 'Could not start the local server.',
  );
  process.exit(1);
});
