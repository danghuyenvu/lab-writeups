import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// IMPORTANT: base must match your GitHub repo name for Project Pages,
// e.g. if your repo is github.com/you/lab-writeups, base is '/lab-writeups/'.
// If you deploy to a custom domain or a User/Org page (you.github.io), set base to '/'.
export default defineConfig({
  base: '/lab-writeups/',
  plugins: [react(), tailwindcss()],
})
