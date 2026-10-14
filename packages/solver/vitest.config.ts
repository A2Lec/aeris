import { defineConfig } from 'vitest/config';

// Chaque résolution prend ~0,8 s (recuit à nombre d'itérations fixe) et certains tests en
// enchaînent plusieurs : sur la CI, plus lente, ils dépassaient le délai par défaut de 5 s.
export default defineConfig({ test: { testTimeout: 30_000 } });
