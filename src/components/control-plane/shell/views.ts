/** Internal application views of the Control Plane shell. */

export type ControlView =
  | 'overview'
  | 'fleet'
  | 'regions'
  | 'workloads'
  | 'recommendations'
  | 'verification'
  | 'assumptions';

export const CONTROL_VIEWS: { key: ControlView; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'regions', label: 'Regions' },
  { key: 'workloads', label: 'Workloads' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'verification', label: 'Verification' },
  { key: 'assumptions', label: 'Assumptions' },
];

export function isControlView(value: string | null): value is ControlView {
  return CONTROL_VIEWS.some((v) => v.key === value);
}
