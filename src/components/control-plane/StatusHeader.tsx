import { formatClock, selectConstrainedRegionCount } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { VERSION_LABEL } from '@/app/version';

const SECTIONS = [
  ['top', 'Overview'],
  ['metrics', 'Metrics'],
  ['topology', 'Topology'],
  ['regions', 'Regions'],
  ['recommendations', 'Recommendations'],
  ['workloads', 'Workloads'],
  ['assumptions', 'Assumptions'],
] as const;

/**
 * Sticky status strip, section navigation, and the Control Plane header with the
 * simulation notice. Constrained-region count and mode are derived from the
 * shared state so they never disagree with the modules below.
 */
export function StatusHeader() {
  const sim = useControlPlane((s) => s.sim);
  const constrained = selectConstrainedRegionCount(sim);
  const mode = sim.controls.mode.charAt(0).toUpperCase() + sim.controls.mode.slice(1);
  const [activeSection, setActiveSection] = useState('top');

  useEffect(() => {
    let queued = false;
    const update = () => {
      queued = false;
      let active = 'top';
      for (const [id] of SECTIONS) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top < window.innerHeight * 0.38) active = id;
      }
      setActiveSection(active);
    };
    const onViewport = () => {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    };
    update();
    window.addEventListener('scroll', onViewport, { passive: true });
    window.addEventListener('resize', onViewport);
    return () => {
      window.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
    };
  }, []);

  return (
    <>
      <div className="cp-stickytop">
        <div className="cp-statusbar" data-screen-label="status-bar">
          <span className="cp-statusbar__item"><span className="cp-statusbar__k mono">System</span> Nominal</span>
          <span className="cp-statusbar__item"><span className="cp-statusbar__k mono">Regions</span> 5</span>
          <span className="cp-statusbar__item"><span className="cp-statusbar__k mono">Active workloads</span> {sim.workloads.length + 1}</span>
          <span className="cp-statusbar__item"><span className="cp-statusbar__k mono">Constrained</span> {constrained}</span>
          <span className="cp-statusbar__item"><span className="cp-statusbar__k mono">Mode</span> {mode}</span>
          <span className="cp-statusbar__item"><span className="cp-statusbar__k mono">Operator approval</span> Required</span>
        </div>
        <nav className="cp-secnav" aria-label="Section navigation">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={activeSection === id ? 'is-active' : undefined} aria-current={activeSection === id ? 'location' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </div>

      <section className="control-head" id="top" data-screen-label="control-header">
        <span className="eyebrow mono">Helicyn · control plane</span>
        <h1>Helicyn Control Plane</h1>
        <span className="cp-demobadge">Interactive simulation</span>
        <div className="cp-opbadge" role="note" aria-label="Operating mode">
          <span>Operator-in-the-loop</span>
          <span>Simulated telemetry</span>
          <span>Approval required</span>
        </div>
        <p className="control-head__sub">
          Pick a scenario below. Every module on this page (topology, regions, recommendations,
          workloads, telemetry) updates from the same simulated fleet state.
        </p>
        <div className="control-statusrow">
          <span className="cp-chip2"><span className="cp-chip2__k mono">Mode</span> Simulation</span>
          <span className="cp-chip2"><span className="cp-chip2__k mono">Build</span> {VERSION_LABEL}</span>
          <span className="cp-chip2"><span className="cp-chip2__k mono">Region</span> Global</span>
          <span className="cp-chip2"><span className="cp-chip2__k mono">System</span> Nominal</span>
          <span className="cp-chip2"><span className="cp-chip2__k mono">Sync</span> {formatClock(sim.clock.seconds)} UTC</span>
        </div>
        <p className="cp-simnotice" role="note">
          <strong>Simulation notice:</strong> This control plane uses illustrative fleet data to
          demonstrate Helicyn&apos;s coordination logic. It does not represent live customer
          infrastructure or verified operational savings.
        </p>
      </section>
    </>
  );
}
import { useEffect, useState } from 'react';
