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
  { key: 'fleet', label: 'Fleet health' },
  { key: 'regions', label: 'Regions' },
  { key: 'workloads', label: 'Workloads' },
  { key: 'recommendations', label: 'Actions' },
  { key: 'verification', label: 'Results' },
  { key: 'assumptions', label: 'Model notes' },
];

export function isControlView(value: string | null): value is ControlView {
  return CONTROL_VIEWS.some((v) => v.key === value);
}
