import { Workloads } from '../Workloads';

/**
 * Workloads: the orchestration queue. Flexible jobs can move, critical
 * inference holds, and batch workloads defer when energy or thermal conditions
 * change — every staged action flows through the canonical store.
 */
export function WorkloadsView() {
  return (
    <div className="cps-view cps-view--workloads">
      <p className="cp-caption">
        Helicyn treats work as the first control surface. Flexible jobs can move, critical inference
        can hold, and batch workloads can defer when energy or thermal conditions change.
      </p>
      <Workloads />
    </div>
  );
}
