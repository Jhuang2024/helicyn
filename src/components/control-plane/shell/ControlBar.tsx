import { useEffect, useRef, useState } from 'react';
import { CustomSelect } from '@/components/common/CustomSelect';
import {
  SCENARIO_KEYS,
  SCENARIO_META,
  formatClock,
  selectSystemStatus,
  type ScenarioKey,
} from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { ExportImport } from '../ExportImport';

const SPEEDS = [1, 60, 300, 900];
const SPEED_OPTIONS = SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }));

/** Scenario selector (listbox popup preserving the original descriptions). */
function ScenarioSelect() {
  const scenario = useControlPlane((s) => s.sim.scenario);
  const setScenario = useControlPlane((s) => s.setScenario);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = SCENARIO_META[scenario];
  return (
    <div className="cp-select" data-value={scenario} ref={rootRef}>
      <span className="cp-select__k mono">Scenario</span>
      <button
        type="button"
        className="cp-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Operating scenario"
        onClick={() => setOpen((v) => !v)}
      >
        {meta.name}
        <span className="cp-select__arrow" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="cp-select__list" role="listbox" aria-label="Operating scenario">
          {SCENARIO_KEYS.map((key: ScenarioKey) => (
            <li key={key}>
              <button
                type="button"
                role="option"
                aria-selected={key === scenario}
                className={'cp-select__opt' + (key === scenario ? ' is-active' : '')}
                onClick={() => {
                  setScenario(key);
                  setOpen(false);
                }}
              >
                <span className="cp-select__optname">{SCENARIO_META[key].name}</span>
                <span className="cp-select__optdesc">{SCENARIO_META[key].description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Session snapshot menu (export / import / reset-to-default). */
function SessionMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);
  return (
    <div className="cps-session" ref={rootRef}>
      <button
        type="button"
        className="cp-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Session
      </button>
      {open && (
        <div className="cps-session__pop" role="menu" aria-label="Session snapshot">
          <ExportImport />
        </div>
      )}
    </div>
  );
}

/** Less frequently used playback controls, kept out of the primary toolbar. */
function SimulationMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const clock = useControlPlane((s) => s.sim.clock);
  const setSpeed = useControlPlane((s) => s.setSpeed);
  const stepForward = useControlPlane((s) => s.stepForward);
  const reset = useControlPlane((s) => s.reset);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div className="cps-session" ref={rootRef}>
      <button
        type="button"
        className="cp-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        More controls
      </button>
      {open && (
        <div className="cps-session__pop cps-simcontrols" role="group" aria-label="More simulation controls">
          <div className="cps-simcontrols__row">
            <span>Playback speed</span>
            <CustomSelect
              compact
              align="end"
              ariaLabel="Playback speed"
              options={SPEED_OPTIONS}
              value={String(clock.speed)}
              onChange={(nextSpeed) => setSpeed(Number(nextSpeed))}
            />
          </div>
          <button type="button" className="cp-btn" onClick={() => stepForward()} disabled={clock.running}>
            Advance 15 minutes
          </button>
          <button type="button" className="cp-btn cp-btn--danger" onClick={reset}>
            Restart scenario
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Global control bar. All globally relevant simulation controls live here :
 * scenario, system status, simulation time, transport (pause/resume/step),
 * playback speed, reset, and the baseline vs. coordinated comparison: and are
 * not duplicated inside views. Stays visually stable across view changes.
 */
export function ControlBar() {
  const sim = useControlPlane((s) => s.sim);
  const setRunning = useControlPlane((s) => s.setRunning);
  const setControl = useControlPlane((s) => s.setControl);
  const status = selectSystemStatus(sim);
  const isBaseline = sim.controls.view === 'baseline';
  const clock = sim.clock;

  return (
    <header className="cps-bar" data-screen-label="control-bar">
      <div className="cps-bar__brand">
        <h1 className="cps-bar__title">Helicyn Control Plane</h1>
        <span className="cp-demobadge">Interactive simulation</span>
      </div>

      <ScenarioSelect />

      <div className={'cps-status cps-status--' + status.level} role="status" aria-live="polite">
        <span className="cps-status__dot" aria-hidden="true" />
        <span className="cps-status__label">{status.label}</span>
      </div>

      <div className="cp-transport" role="group" aria-label="Simulation controls">
        <span className="cp-clock mono" aria-label="Simulation time">
          {formatClock(clock.seconds)} UTC
        </span>
        <button
          type="button"
          className="cp-btn"
          onClick={() => setRunning(!clock.running)}
          aria-pressed={clock.running}
        >
          {clock.running ? 'Pause live demo' : 'Resume live demo'}
        </button>
        <SimulationMenu />
      </div>

      <div className="cps-bar__right">
        <div className="cp-seg cp-seg--bar" role="group" aria-label="Baseline or coordinated view">
          <button
            type="button"
            className={'cp-seg__btn' + (isBaseline ? ' is-active' : '')}
            aria-pressed={isBaseline}
            onClick={() => setControl({ view: 'baseline' })}
          >
            Original plan
          </button>
          <button
            type="button"
            className={'cp-seg__btn' + (!isBaseline ? ' is-active' : '')}
            aria-pressed={!isBaseline}
            onClick={() => setControl({ view: 'after' })}
          >
            Helicyn plan
          </button>
        </div>
        <SessionMenu />
      </div>
    </header>
  );
}
