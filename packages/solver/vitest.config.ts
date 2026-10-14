import { defineConfig } from 'vitest/config';

// Le recuit prend plusieurs secondes par test : la limite de 5 s par défaut est trop juste
// dès que plusieurs fichiers de tests tournent en parallèle.
export default defineConfig({ test: { testTimeout: 20_000 } });
