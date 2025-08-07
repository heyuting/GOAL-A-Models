import path from "path"
import { fileURLToPath } from "url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Proxy for Yale Grace job submission API
      '/api': {
        target: 'https://73cd03d25f04.ngrok-free.app', //local ngrok workaround
        // target: 'https://goal-a-proxy-api.onrender.com', //render cloud
        changeOrigin: true,
        secure: true,
      },
      // Legacy USGS API proxies (commented out)
      // '/api/usgs': {
      //   target: 'https://waterservices.usgs.gov',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api\/usgs/, ''),
      //   secure: false,
      // },
      // '/api/wqp': {
      //   target: 'https://www.waterqualitydata.us',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api\/wqp/, ''),
      //   secure: false,
      // },
      // '/api/usgs-dv': {
      //   target: 'https://waterservices.usgs.gov',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api\/usgs-dv/, ''),
      //   secure: false,
      // }
    }
  }
})
