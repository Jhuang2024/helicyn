import { Workloads } from '../Workloads';

/**
 * Workloads: the orchestration queue. Flexible jobs can move, critical
 * inference holds, and batch workloads defer when energy or thermal conditions
 * change: every staged action flows through the canonical store.
 */
export function WorkloadsView() {
  return (
    <div className="cps-view cps-view--workloads">
      <p className="cp-caption">
        Every computing job running across the fleet. Flexible jobs can move to a better site or
        wait for a better time; critical jobs stay exactly where they are, no matter what.
      </p>
      <Workloads />
    </div>
  );
}
