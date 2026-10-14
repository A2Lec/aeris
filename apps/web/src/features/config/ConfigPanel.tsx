import type { MissionInput } from '@aeris/shared';
import { useState } from 'react';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { useConfigEditorStore } from './store';
import './config.css';

/**
 * Étapes « Configuration » et « Phasage ».
 * TODO(P5) :
 *  - saisie de l'arrêté (périmètre, période, nombre max de drones) ;
 */
export function ConfigPanel() {
  const { state, catalog, setState, run, busy } = useMissionStore();
  const editor = useConfigEditorStore();
  const [pilotName, setPilotName] = useState('');
  const [pilotLevel, setPilotLevel] = useState<'TP1' | 'TP2'>('TP1');
  const [droneModelId, setDroneModelId] = useState('');
  const [selectedPilotId, setSelectedPilotId] = useState('');
  const activateDraw = (mode: Parameters<typeof editor.setDrawMode>[0]) => {
    editor.setEditing(false);
    editor.setDrawMode(editor.drawMode === mode ? 'idle' : mode);
  };
  const toggleEditing = () => {
    if (!editor.editing) editor.setDrawMode('idle');
    editor.setEditing(!editor.editing);
  };

  if (!state) {
    const createMission = () => {
      const workArea = editor.setupWorkArea;
      if (!workArea) return;
      const input: MissionInput = {
        name: editor.setupName.trim(),
        workArea,
        environment: editor.setupEnvironment,
        maxDrones: editor.setupMaxDrones,
        phaseCount: editor.setupPhaseCount,
        gridCellM: editor.setupGridCellM,
        pilots: [],
        resources: [],
        priorityZones: [],
        constraintZones: [],
      };
      void run(async () => {
        editor.setDrawMode('idle');
        setState(await api.createMission(input));
      });
    };

    return (
      <section>
        <h2>Créer une mission</h2>
        <p className="config-help">
          Renseignez les paramètres, puis dessinez la zone sur la carte. Cliquez sur le premier
          sommet pour fermer le polygone.
        </p>
        <label>
          Nom de la mission
          <input
            type="text"
            value={editor.setupName}
            onChange={(event) => editor.setSetupName(event.target.value)}
            placeholder="Ex. Recherche secteur nord"
          />
        </label>
        <label>
          Environnement
          <select
            value={editor.setupEnvironment}
            onChange={(event) =>
              editor.setSetupEnvironment(event.target.value as typeof editor.setupEnvironment)
            }
          >
            <option value="rural">Rural</option>
            <option value="urbain">Urbain</option>
          </select>
        </label>
        <label>
          Drones maximum
          <input
            type="number"
            min={0}
            value={editor.setupMaxDrones}
            onChange={(event) => editor.setSetupMaxDrones(Number(event.target.value))}
          />
        </label>
        <label>
          Nombre de phases
          <input
            type="number"
            min={1}
            max={6}
            value={editor.setupPhaseCount}
            onChange={(event) => editor.setSetupPhaseCount(Number(event.target.value))}
          />
        </label>
        <label>
          Taille des cellules (m)
          <input
            type="number"
            min={25}
            step={25}
            value={editor.setupGridCellM}
            onChange={(event) => editor.setSetupGridCellM(Number(event.target.value))}
          />
        </label>
        <div className="config-draw-tools">
          <button
            className={editor.drawMode === 'setupWorkArea' ? 'primary' : ''}
            onClick={() =>
              editor.setDrawMode(editor.drawMode === 'setupWorkArea' ? 'idle' : 'setupWorkArea')
            }
            disabled={busy}
          >
            {editor.setupWorkArea ? 'Redessiner la zone' : 'Dessiner la zone de travail'}
          </button>
          {editor.setupWorkArea && <span className="config-ready">Zone dessinée</span>}
        </div>
        <button
          className="primary"
          onClick={createMission}
          disabled={
            busy ||
            !editor.setupName.trim() ||
            !editor.setupWorkArea ||
            !Number.isInteger(editor.setupMaxDrones) ||
            editor.setupMaxDrones < 0 ||
            !Number.isInteger(editor.setupPhaseCount) ||
            editor.setupPhaseCount < 1 ||
            editor.setupPhaseCount > 6 ||
            !Number.isFinite(editor.setupGridCellM) ||
            editor.setupGridCellM < 25
          }
        >
          Créer la mission
        </button>
      </section>
    );
  }

  const { mission, status } = state;
  const phases = [...Array(mission.phaseCount).keys()];
  const update = (patch: Partial<MissionInput>) =>
    run(async () => {
      const { id: _id, ...input } = mission;
      setState(await api.updateMission(mission.id, { ...input, ...patch }));
    });
  const addPilot = () => {
    const name = pilotName.trim();
    const pilotId = crypto.randomUUID();
    if (!name) return;
    void run(async () => {
      const { id: _id, ...input } = mission;
      const updated = await api.updateMission(mission.id, {
        ...input,
        pilots: [...mission.pilots, { id: pilotId, name, level: pilotLevel }],
      });
      setState(updated);
      setSelectedPilotId(pilotId);
    });
    setPilotName('');
  };
  const addPilotDrone = () => {
    const modelId = droneModelId || catalog?.drones[0]?.id;
    if (
      !selectedPilotId ||
      !mission.pilots.some((pilot) => pilot.id === selectedPilotId) ||
      !modelId ||
      !catalog?.drones.some((drone) => drone.id === modelId) ||
      mission.resources.some(
        (resource) => resource.pilotId === selectedPilotId && resource.droneModelId === modelId,
      )
    )
      return;

    void update({
      resources: [
        ...mission.resources,
        {
          id: `r-${crypto.randomUUID().slice(0, 8)}`,
          pilotId: selectedPilotId,
          droneModelId: modelId,
          available: true,
        },
      ],
    });
  };
  const activePhases = (zone: (typeof mission.priorityZones)[number]) =>
    zone.phases?.length
      ? zone.phases.filter((phase) => phase >= 0 && phase < mission.phaseCount)
      : phases;
  const toggleZonePhase = (zoneId: string, phase: number, checked: boolean) => {
    const zone = mission.priorityZones.find((item) => item.id === zoneId);
    if (!zone) return;

    const current = activePhases(zone);
    const next = checked
      ? [...new Set([...current, phase])].sort((a, b) => a - b)
      : current.filter((item) => item !== phase);
    if (!next.length) return;

    update({
      priorityZones: mission.priorityZones.map((item) =>
        item.id === zoneId
          ? { ...item, phases: next.length === phases.length ? undefined : next }
          : item,
      ),
    });
  };
  const modelName = (id: string) => catalog?.drones.find((d) => d.id === id)?.name ?? id;

  return (
    <section>
      <h2>{mission.name}</h2>
      <h3>Zone de travail et espaces</h3>
      <p className="config-help">
        Dessinez les polygones directement sur la carte. Cliquez pour placer les sommets, puis sur
        le premier sommet pour fermer le polygone.
      </p>
      <div className="config-draw-tools">
        <button
          className={editor.drawMode === 'workArea' ? 'primary' : ''}
          onClick={() => activateDraw('workArea')}
          disabled={busy || editor.editing}
        >
          Définir la zone de travail
        </button>
        <button className={editor.editing ? 'primary' : ''} onClick={toggleEditing} disabled={busy}>
          {editor.editing ? 'Terminer la modification' : 'Modifier les polygones'}
        </button>
      </div>
      <label>
        Nom de la prochaine zone
        <input
          type="text"
          value={editor.zoneName}
          onChange={(event) => editor.setZoneName(event.target.value)}
          placeholder="Nom de zone"
        />
      </label>
      <label>
        Priorité
        <select
          value={editor.priorityLevel}
          onChange={(event) => editor.setPriorityLevel(Number(event.target.value) as 1 | 2 | 3)}
        >
          <option value={1}>1 — faible</option>
          <option value={2}>2 — moyenne</option>
          <option value={3}>3 — maximale</option>
        </select>
      </label>
      <div className="config-draw-tools">
        <button
          className={editor.drawMode === 'priority' ? 'primary' : ''}
          onClick={() => activateDraw('priority')}
          disabled={busy || editor.editing}
        >
          Ajouter une zone prioritaire
        </button>
        <select
          aria-label="Type de contrainte"
          value={editor.constraintKind}
          onChange={(event) =>
            editor.setConstraintKind(event.target.value as typeof editor.constraintKind)
          }
        >
          <option value="interdite">Zone interdite</option>
          <option value="hauteur_limitee">Hauteur limitée</option>
          <option value="urbaine">Zone urbaine</option>
        </select>
        <button
          className={editor.drawMode === 'constraint' ? 'primary' : ''}
          onClick={() => activateDraw('constraint')}
          disabled={busy || editor.editing}
        >
          Ajouter une contrainte
        </button>
      </div>
      {editor.drawMode !== 'idle' && (
        <p className="config-help">
          Mode de dessin actif : terminez le polygone sur la carte ou recliquez sur le bouton pour
          annuler.
        </p>
      )}

      <label>
        Drones max (arrêté)
        <input
          type="number"
          min={0}
          value={mission.maxDrones}
          onChange={(e) => update({ maxDrones: Number(e.target.value) })}
        />
      </label>

      {status === 'phasage' && (
        <label>
          Nombre de phases
          <input
            type="number"
            min={1}
            max={6}
            value={mission.phaseCount}
            onChange={(event) => {
              const phaseCount = Number(event.target.value);
              if (!Number.isInteger(phaseCount) || phaseCount < 1 || phaseCount > 6) return;

              update({
                phaseCount,
                priorityZones: mission.priorityZones.map((zone) => {
                  if (!zone.phases?.length) return zone;
                  const selected = zone.phases.filter((phase) => phase < phaseCount);
                  const validPhases = selected.length ? selected : [0];
                  return {
                    ...zone,
                    phases: validPhases.length === phaseCount ? undefined : validPhases,
                  };
                }),
              });
            }}
          />
        </label>
      )}

      <h3>Couples télépilote / drone</h3>
      <div className="config-resource-form">
        <strong>1. Ajouter un télépilote</strong>
        <label>
          Nom du télépilote
          <input
            type="text"
            value={pilotName}
            onChange={(event) => setPilotName(event.target.value)}
            placeholder="Nom"
          />
        </label>
        <label>
          Niveau
          <select
            value={pilotLevel}
            onChange={(event) => setPilotLevel(event.target.value as typeof pilotLevel)}
          >
            <option value="TP1">TP1</option>
            <option value="TP2">TP2</option>
          </select>
        </label>
        <button onClick={addPilot} disabled={busy || !pilotName.trim()}>
          Ajouter le télépilote
        </button>
      </div>
      <div className="config-resource-form">
        <strong>2. Choisir les drones pilotables</strong>
        <label>
          Télépilote
          <select
            value={selectedPilotId || mission.pilots[0]?.id || ''}
            onChange={(event) => setSelectedPilotId(event.target.value)}
            disabled={!mission.pilots.length}
          >
            {mission.pilots.map((pilot) => (
              <option key={pilot.id} value={pilot.id}>
                {pilot.name} ({pilot.level})
              </option>
            ))}
          </select>
        </label>
        <label>
          Drone pilotable
          <select
            value={droneModelId || catalog?.drones[0]?.id || ''}
            onChange={(event) => setDroneModelId(event.target.value)}
            disabled={!catalog?.drones.length}
          >
            {catalog?.drones.map((drone) => (
              <option key={drone.id} value={drone.id}>
                {drone.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={addPilotDrone}
          disabled={
            busy ||
            !mission.pilots.length ||
            !catalog?.drones.length ||
            mission.resources.some(
              (resource) =>
                resource.pilotId === (selectedPilotId || mission.pilots[0]?.id) &&
                resource.droneModelId === (droneModelId || catalog?.drones[0]?.id),
            )
          }
        >
          Associer ce drone au pilote
        </button>
      </div>
      <h4>Télépilotes</h4>
      <ul className="list">
        {mission.pilots.map((pilot) => {
          const hasResources = mission.resources.some((resource) => resource.pilotId === pilot.id);
          return (
            <li key={pilot.id}>
              {pilot.name} ({pilot.level})
              <button
                className="small"
                onClick={() => {
                  void update({ pilots: mission.pilots.filter((item) => item.id !== pilot.id) });
                  if (selectedPilotId === pilot.id) setSelectedPilotId('');
                }}
                disabled={busy || hasResources}
                aria-label={`Supprimer le télépilote ${pilot.name}`}
                title={hasResources ? 'Supprimez d’abord ses associations drone' : undefined}
              >
                Supprimer
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="list">
        {mission.resources.map((r) => {
          const p = mission.pilots.find((x) => x.id === r.pilotId);
          return (
            <li key={r.id}>
              <b>{r.id}</b> {p?.name} ({p?.level}) — {modelName(r.droneModelId)}
              <label className="resource-availability">
                <input
                  type="checkbox"
                  checked={r.available}
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      resources: mission.resources.map((resource) =>
                        resource.id === r.id
                          ? { ...resource, available: event.currentTarget.checked }
                          : resource,
                      ),
                    })
                  }
                />
                Disponible
              </label>
              <button
                className="small"
                onClick={() =>
                  update({
                    pilots: mission.pilots.filter(
                      (pilot) =>
                        pilot.id !== r.pilotId ||
                        mission.resources.some(
                          (resource) => resource.pilotId === pilot.id && resource.id !== r.id,
                        ),
                    ),
                    resources: mission.resources.filter((resource) => resource.id !== r.id),
                  })
                }
                disabled={busy}
                aria-label={`Supprimer le couple ${r.id}`}
              >
                Supprimer
              </button>
              {r.allowedArea && (
                <>
                  <em> · zone limite</em>
                  <button
                    className="small"
                    onClick={() =>
                      update({
                        resources: mission.resources.map((resource) => {
                          if (resource.id !== r.id) return resource;
                          const { allowedArea: _allowedArea, ...rest } = resource;
                          return rest;
                        }),
                      })
                    }
                    disabled={busy}
                    aria-label={`Supprimer la zone limite de ${r.id}`}
                  >
                    Supprimer la zone
                  </button>
                </>
              )}
              {r.fixedPosition && <em> · position imposée</em>}
            </li>
          );
        })}
        {mission.resources.length > 0 && (
          <li>
            <label>
              Couple à limiter
              <select
                value={editor.resourceId || mission.resources[0].id}
                onChange={(event) => editor.setResourceId(event.target.value)}
              >
                {mission.resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={editor.drawMode === 'resourceArea' ? 'primary' : ''}
              onClick={() => {
                editor.setResourceId(editor.resourceId || mission.resources[0].id);
                activateDraw('resourceArea');
              }}
              disabled={busy || editor.editing}
            >
              Dessiner / remplacer la zone limite
            </button>
          </li>
        )}
      </ul>

      <h3>{status === 'phasage' ? 'Affectation aux phases' : 'Zones prioritaires'}</h3>
      {status === 'phasage' && (
        <p className="config-help">
          Choisissez les phases actives pour chaque zone. Une zone doit rester active dans au moins
          une phase.
        </p>
      )}
      <ul className="list">
        {mission.priorityZones.map((z) => (
          <li key={z.id}>
            P{z.level} — {z.name}
            {status === 'phasage' ? (
              <div className="zone-phases" aria-label={`Phases actives pour ${z.name}`}>
                {phases.map((phase) => {
                  const selected = activePhases(z);
                  const checked = selected.includes(phase);
                  return (
                    <label key={phase} className="zone-phase">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy || (checked && selected.length === 1)}
                        onChange={(event) =>
                          toggleZonePhase(z.id, phase, event.currentTarget.checked)
                        }
                      />
                      Phase {phase + 1}
                    </label>
                  );
                })}
                {!z.phases?.length && <span className="config-help">Toutes les phases</span>}
              </div>
            ) : (
              <em>
                {' '}
                ·{' '}
                {z.phases?.length
                  ? `Phase(s) ${activePhases(z)
                      .map((phase) => phase + 1)
                      .join(', ')}`
                  : 'Toutes les phases'}
              </em>
            )}
            <button
              className="small"
              onClick={() =>
                update({ priorityZones: mission.priorityZones.filter((zone) => zone.id !== z.id) })
              }
              disabled={busy}
              aria-label={`Supprimer ${z.name}`}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <h3>Contraintes</h3>
      <ul className="list">
        {mission.constraintZones.map((zone) => (
          <li key={zone.id}>
            {zone.name} — {zone.kind}
            <button
              className="small"
              onClick={() =>
                update({
                  constraintZones: mission.constraintZones.filter((item) => item.id !== zone.id),
                })
              }
              disabled={busy}
              aria-label={`Supprimer ${zone.name}`}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>

      <div className="actions">
        {status === 'config' ? (
          <button
            onClick={() => run(async () => setState(await api.setStatus(mission.id, 'phasage')))}
          >
            Phasage →
          </button>
        ) : (
          <button
            onClick={() =>
              run(async () => {
                await api.solve(mission.id);
                setState(await api.getMission(mission.id));
              })
            }
            disabled={busy}
          >
            {busy ? 'Calcul…' : 'Calculer les propositions →'}
          </button>
        )}
      </div>
    </section>
  );
}
