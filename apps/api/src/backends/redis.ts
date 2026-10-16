import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import type { LiveState, MissionState } from '@aeris/shared';
import type { Backend } from '../store';

/** Une mission sans activité depuis une semaine est oubliée. */
const MISSION_TTL_S = 7 * 24 * 3600;
const INDEX = 'aeris:missions';
const DRONE_IDS = 'aeris:drone-ids';
const DRONES = 'aeris:drones';
const missionKey = (id: string) => `aeris:mission:${id}`;
const liveChannel = (id: string) => `aeris:live:${id}`;

/** Écriture conditionnelle : KEYS = [mission, index] ; ARGV = [version, état, ttl, date, id]. */
const PUT_MISSION = `
local v = redis.call('HGET', KEYS[1], 'v')
if (v or '0') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 's', ARGV[2], 'v', tonumber(ARGV[1]) + 1)
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('ZADD', KEYS[2], 'NX', ARGV[4], ARGV[5])
return 1`;

/** KEYS = [ids, drones] ; ARGV = [id, drone]. */
const ADD_DRONE = `
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('RPUSH', KEYS[2], ARGV[2])
return 1`;

/**
 * État partagé entre les instances de la fonction Vercel. Une connexion de commandes et,
 * à la demande, une connexion d'abonnement multiplexée vers un bus local par instance.
 */
export function redisBackend(url: string): Backend {
  const redis = new Redis(url, { maxRetriesPerRequest: 3 });
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  let subscriber: Redis | undefined;
  const getSubscriber = () => {
    if (!subscriber) {
      subscriber = redis.duplicate();
      subscriber.on('message', (channel: string, message: string) =>
        bus.emit(channel, JSON.parse(message) as LiveState),
      );
    }
    return subscriber;
  };

  return {
    async getMission(id) {
      const [state, version] = await redis.hmget(missionKey(id), 's', 'v');
      if (state === null || version === null) return undefined;
      return { state: JSON.parse(state) as MissionState, version: Number(version) };
    },
    async listMissions() {
      const ids = await redis.zrange(INDEX, 0, -1);
      if (ids.length === 0) return [];
      const states = await Promise.all(ids.map((id) => redis.hget(missionKey(id), 's')));
      const expired = ids.filter((_, i) => states[i] === null);
      if (expired.length > 0) await redis.zrem(INDEX, ...expired);
      return states.flatMap((s) => (s === null ? [] : [JSON.parse(s) as MissionState]));
    },
    async putMission(state, version) {
      const id = state.mission.id;
      const args = [String(version), JSON.stringify(state), MISSION_TTL_S, Date.now(), id];
      return (await redis.eval(PUT_MISSION, 2, missionKey(id), INDEX, ...args)) === 1;
    },
    async publishLive(missionId, live) {
      await redis.publish(liveChannel(missionId), JSON.stringify(live));
    },
    async subscribeLive(missionId, cb) {
      const channel = liveChannel(missionId);
      const sub = getSubscriber();
      // Écouteur posé avant d'attendre : un désabonnement concurrent ne coupe pas le canal.
      const first = bus.listenerCount(channel) === 0;
      bus.on(channel, cb);
      if (first) {
        try {
          await sub.subscribe(channel);
        } catch (error) {
          bus.off(channel, cb);
          throw error;
        }
      }
      return async () => {
        bus.off(channel, cb);
        if (bus.listenerCount(channel) === 0) await sub.unsubscribe(channel);
      };
    },
    async loadCustomDrones() {
      return (await redis.lrange(DRONES, 0, -1)).map((d) => JSON.parse(d) as unknown);
    },
    async addCustomDrone(drone) {
      const added = await redis.eval(
        ADD_DRONE,
        2,
        DRONE_IDS,
        DRONES,
        drone.id,
        JSON.stringify(drone),
      );
      return added === 1;
    },
  };
}
