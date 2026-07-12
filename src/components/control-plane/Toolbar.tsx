import { useState } from 'react';
import { SCENARIO_META, SCENARIO_KEYS, SCN, formatClock, type ScenarioKey } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';

const SEQ_STEPS = [
  ['detect', '01 · Detect'],
  ['analyze', '02 · Analyze'],
  ['act', '03 · Act'],
  ['verify', '04 · Verify'],
  ['save', '05 · Save'],
] as const;

const SPEEDS = [1, 60, 300, 900];

/**
 * Scenario selector + simulation toolbar. The scenario select is the single
 * source that re-renders every module; the transport controls (pause/resume,
 * speed, step, reset, rerun) drive the shared simulation clock. The alert and
 * Detect→Save rail reflect the active scenario.
 */
export function Toolbar() {
  const scenario = useControlPlane((s) => s.sim.scenario);
  const clock = useControlPlane((s) => s.sim.clock);
  const setScenario = useControlPlane((s) => s.setScenario);
  const setRunning = useControlPlane((s) => s.setRunning);
  const setSpeed = useControlPlane((s) => s.setSpeed);
  const stepForward = useControlPlane((s) => s.stepForward);
  const reset = useControlPlane((s) => s.reset);
  const [open, setOpen] = useState(false);

  const meta = SCENARIO_META[scenario];
  const alert = SCN[scenario].alert;

  return (
    <div className="cp-toolbar">
      <div className="cp-toolbar__row">
        <div className="cp-select" data-value={scenario}>
          <span className="cp-select__k mono">Operating scenario</span>
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
            {clock.running ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="cp-btn" onClick={() => stepForward()} disabled={clock.running}>
            Step +15m
          </button>
          <label className="cp-speed">
            <span className="cp-speed__k mono">Speed</span>
            <select
              value={clock.speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label="Simulation speed"
            >
              {SPEEDS.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}×
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="cp-btn" onClick={reset}>
            Rerun scenario
          </button>
        </div>
      </div>

      <p className="cp-toolbar__desc">{meta.description}</p>

      <div className={'cp-alert cp-alert--' + alert.level} role="status" aria-live="polite">
        <span className="cp-alert__ttl">{alert.ttl}</span>
        <span className="cp-alert__body">{alert.body}</span>
      </div>

      <ol className="cp-seq" aria-label="Coordination sequence">
        {SEQ_STEPS.map(([key, label]) => (
          <li key={key} className="cp-seq__step">
            <span className="mono">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
