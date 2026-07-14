import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useControlPlane } from '@/state/controlPlaneStore';
import { ControlBar } from './ControlBar';
import { ControlNav } from './ControlNav';
import { isControlView, type ControlView } from './views';
import { EventStream } from './EventStream';
import { Inspector } from './Inspector';
import { OverviewView } from '../views/OverviewView';
import { FleetView } from '../views/FleetView';
import { RegionsView } from '../views/RegionsView';
import { WorkloadsView } from '../views/WorkloadsView';
import { RecommendationsView } from '../views/RecommendationsView';
import { VerificationView } from '../views/VerificationView';
import { AssumptionsView } from '../views/AssumptionsView';

const VIEW_COMPONENTS: Record<ControlView, () => JSX.Element> = {
  overview: OverviewView,
  fleet: FleetView,
  regions: RegionsView,
  workloads: WorkloadsView,
  recommendations: RecommendationsView,
  verification: VerificationView,
  assumptions: AssumptionsView,
};

/**
 * Application shell: global controls, compact workspace navigation, one main
 * visualization canvas, and contextual detail surfaces on demand.
 *
 * The active view lives in the URL (?view=…) so it is refresh-safe and
 * shareable; the simulation itself lives in the canonical store, so switching
 * views never resets scenario, time, selection, or operator decisions.
 */
export function ControlPlaneShell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramView = searchParams.get('view');
  const view: ControlView = isControlView(paramView) ? paramView : 'overview';
  const setView = (v: ControlView) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'overview') next.delete('view');
    else next.set('view', v);
    setSearchParams(next);
  };

  const [streamCollapsed, setStreamCollapsed] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const selectedEntity = useControlPlane((s) => s.sim.selectedEntity);
  const selectEntity = useControlPlane((s) => s.selectEntity);

  // On small screens the inspector is a bottom sheet that opens on selection.
  useEffect(() => {
    if (selectedEntity) setInspectorOpen(true);
  }, [selectedEntity]);

  // Escape clears the global selection (and closes the mobile sheet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|select|textarea)$/i.test(target.tagName)) return;
      selectEntity(null);
      setInspectorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectEntity]);

  const ViewComponent = VIEW_COMPONENTS[view];

  return (
    <div className="cps-shell">
      <ControlBar />
      <div className="cps-workspacebar">
        <ControlNav view={view} onChange={setView} />
        <button
          type="button"
          className={'cps-inspectorbtn cp-btn' + (inspectorOpen ? ' is-active' : '')}
          aria-expanded={inspectorOpen}
          onClick={() => setInspectorOpen((v) => !v)}
        >
          <span>Details</span>
          <span className="cps-inspectorbtn__state mono">
            {selectedEntity ? selectedEntity.type : 'scenario'}
          </span>
        </button>
      </div>
      <div className={'cps-main' + (inspectorOpen ? ' has-inspector' : '')}>
        <section className="cps-canvas" aria-label="Visualization canvas">
          <ViewComponent />
        </section>
        {inspectorOpen && (
          <div className="cps-side is-open">
            <Inspector onClose={() => setInspectorOpen(false)} />
          </div>
        )}
      </div>
      <EventStream collapsed={streamCollapsed} onToggle={() => setStreamCollapsed((v) => !v)} />
    </div>
  );
}
