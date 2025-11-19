import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // This maps your .env VITE_API_KEY to process.env.API_KEY in the browser code
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
      'process.env.SPOTIFY_CLIENT_ID': JSON.stringify(env.VITE_SPOTIFY_CLIENT_ID),
      'process.env': {}
    }
  }
})