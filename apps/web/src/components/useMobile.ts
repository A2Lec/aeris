import { useSyncExternalStore } from 'react';

/** Même seuil que les règles `@media (max-width: 900px)` des feuilles de style. */
export const MOBILE_QUERY = '(max-width: 900px)';

const query = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : undefined;

function subscribe(onChange: () => void) {
  const mq = query();
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}

/** Écran étroit (téléphone, tablette en portrait) : mise en page mobile. */
export function isMobile() {
  return query()?.matches ?? false;
}

/** Suit le passage entre mise en page mobile et bureau (rotation, redimensionnement). */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, isMobile, () => false);
}
