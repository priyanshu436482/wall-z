import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Required for GitHub project pages: https://priyanshu436482.github.io/wall-z/
  base: '/wall-z/',
})
