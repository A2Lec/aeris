import type { Assignment, Catalog, Mission } from '@aeris/shared';
import { pilotColor } from '../map/colors';
import { formatSlot } from './format';
import './components.css';

/**
 * Carte d'un couple engagé : niveau du télépilote (TP1 1 km en vert, TP2 2 km en bleu),
 * drone, puis les 4 dimensions de son affectation : où, jusqu'où, à quelle hauteur, quand.
 * Les hauteurs sont celles calculées par le back, sans arrondi ni correction.
 */
export function CoupleCard({
  assignment: a,
  mission,
  catalog,
  focused,
  moved,
  onFocus,
  onUnavailable,
}: {
  assignment: Assignment;
  mission: Mission;
  catalog?: Catalog;
  focused?: boolean;
  /** Position déplacée à la main, en attente de recalcul. */
  moved?: boolean;
  onFocus: () => void;
  /** Conduite seulement : déclarer le couple indisponible. */
  onUnavailable?: () => void;
}) {
  const res = mission.resources.find((r) => r.id === a.resourceId);
  const pilot = mission.pilots.find((p) => p.id === res?.pilotId);
  const drone = catalog?.drones.find((d) => d.id === res?.droneModelId);
  const pilotIds = mission.pilots.map((item) => item.id);
  const [lng, lat] = a.position.coordinates;
  const km = a.radiusM / 1000;

  return (
    <article className={`card couple ${focused ? 'focused' : ''}`}>
      <header>
        <div>
          <b className="pilot-name" title={a.resourceId}>
            {pilot && (
              <span
                className="pilot-color-dot"
                style={{ backgroundColor: pilotColor(pilot.id, pilotIds) }}
                aria-hidden="true"
              />
            )}
            {pilot?.name ?? 'Télépilote inconnu'}
          </b>
          <small>{drone?.name ?? res?.droneModelId}</small>
        </div>
        {pilot && (
          <span className={`pill ${pilot.level === 'TP1' ? 'ok' : 'info'}`}>
            {pilot.level}, {km} km
          </span>
        )}
      </header>
      <div className="pills">
        <span className="pill" title="Position du drone">
          {a.sector ? 'Secteur dédié' : `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
        </span>
        <span className="pill" title="Rayon d’action">
          Rayon {km} km
        </span>
        <span className="pill" title="Tranche de hauteur au-dessus du sol">
          {a.altitude.minM} à {a.altitude.maxM} m
        </span>
        <span className="pill" title="Créneau de vol">
          {formatSlot(a.slot)}
        </span>
        {moved && <span className="pill warn">Déplacé, à recalculer</span>}
        {drone?.thermal && <span className="pill">Thermique</span>}
        {drone?.night && <span className="pill">Nuit</span>}
      </div>
      <div className="couple-actions">
        <button className="small" onClick={onFocus} aria-pressed={focused}>
          Déplacer
        </button>
        {onUnavailable && (
          <button className="small danger" onClick={onUnavailable}>
            Déclarer indisponible
          </button>
        )}
      </div>
    </article>
  );
}
