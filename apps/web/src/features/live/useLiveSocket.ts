import { useEffect } from 'react';
import type { WsMessage } from '@aeris/shared';
import { liveSocketUrl } from '../../api/client';
import { useLiveStore } from './store';

/** Abonnement WebSocket à l'état temps réel, avec reconnexion automatique. */
export function useLiveSocket(missionId: string | undefined) {
  const { setLive, setConnected } = useLiveStore();
  useEffect(() => {
    if (!missionId) return;
    let ws: WebSocket | undefined;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      ws = new WebSocket(liveSocketUrl(missionId));
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as WsMessage;
        if (msg.type === 'live') setLive(msg.live);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [missionId, setLive, setConnected]);
}
