import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// node polyfills : le SDK Circles utilise des modules node (buffer, etc.)
// dans le navigateur, comme le jukebox.
export default defineConfig({
  plugins: [nodePolyfills()],
  server: { host: true, port: 3000 }, // host:true => accessible sur le wifi local
});
