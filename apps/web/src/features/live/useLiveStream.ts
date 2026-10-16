import { useEffect } from 'react';
import { API, type LiveMessage } from '@aeris/shared';
import { isMock } from '../../api/client';
import { subscribeMockLive } from '../../api/mock';
import { useLiveStore } from './store';

/** Délai avant d'afficher « déconnecté » : couvre la reconnexion de routine du flux. */
const OFFLINE_GRACE_MS = 2500;

/**
 * Abonnement SSE à l'état temps réel, avec reconnexion automatique. Le serveur recycle le flux
 * toutes les quelques minutes (durée max d'une fonction Vercel) : la reconnexion est silencieuse.
 */
export function useLiveStream(missionId: string | undefined) {
  const { setLive, setConnected } = useLiveStore();
  useEffect(() => {
    if (!missionId) return;
    if (isMock) {
      setConnected(true);
      return subscribeMockLive(setLive);
    }
    let source: EventSource | undefined;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let offline: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      source = new EventSource(API.liveStream(missionId));
      source.onopen = () => {
        clearTimeout(offline);
        setConnected(true);
      };
      source.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as LiveMessage;
        if (msg.type === 'live') setLive(msg.live);
      };
      source.onerror = () => {
        clearTimeout(offline);
        offline = setTimeout(() => setConnected(false), OFFLINE_GRACE_MS);
        // EventSource se reconnecte seul, sauf après une réponse HTTP en erreur.
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          retry = setTimeout(connect, 1500);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(offline);
      source?.close();
    };
  }, [missionId, setLive, setConnected]);
}
