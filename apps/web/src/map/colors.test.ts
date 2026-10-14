import { describe, expect, it, vi } from 'vitest';

vi.mock('../theme', () => ({ SEMANTIC: { neutral: '#64748B' } }));

import { pilotColor } from './colors';

describe('pilotColor', () => {
  it('attribue une couleur différente à chaque télépilote de la mission', () => {
    const pilotIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const colors = pilotIds.map((pilotId) => pilotColor(pilotId, pilotIds));

    expect(new Set(colors).size).toBe(pilotIds.length);
  });

  it('retourne une couleur de secours pour un télépilote inconnu', () => {
    expect(pilotColor('unknown', ['p1'])).toMatch(/^#[\da-f]{6}$/i);
  });
});
