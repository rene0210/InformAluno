import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // O projeto tem duas cópias de node_modules: a da raiz e a de
    // inform-aluno-api (que também declara react-bootstrap). Sem o dedupe,
    // o react interno de inform-aluno-api vira uma SEGUNDA instância do React
    // e o react-bootstrap dispara "Invalid hook call" no <Container>.
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-bootstrap',
    ],
  },
})
