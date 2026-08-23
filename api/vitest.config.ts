import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integração fala com Postgres real; rodar em paralelo faz um teste
    // apagar as linhas que o outro acabou de criar.
    fileParallelism: false,
    setupFiles: ['./tests/integration/setup.ts'],
  },
})
