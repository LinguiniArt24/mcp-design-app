import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		server: {
			port: 5173,
			// Fail instead of moving to 5174, so a second `npm run dev` always
			// replaces the server on this port rather than starting another one.
			strictPort: true,
		},
		plugins: [
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			react(),
		],
	}
})
