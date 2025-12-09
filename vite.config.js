import path from "path"
import { fileURLToPath } from "url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, __dirname, '')
  
  return {
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
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false, // Allow HTTP for localhost
          configure: (proxy, options) => {
            // Log proxy configuration for debugging
            console.log('API Proxy configured for:', options.target);
          }
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
  }
})
