import { useRef, useState } from 'react';
import { useControlPlane } from '@/state/controlPlaneStore';
import { createInitialSimulationState } from '@/simulation';

/**
 * Session shareability: export the current simulation as a JSON snapshot and
 * import one back (validated before it is applied), plus reset-to-default.
 * Persisted store state is versioned separately so schema changes never crash
 * the app. No secrets or credentials are ever included in a snapshot.
 */
export function ExportImport() {
  const exportSnapshot = useControlPlane((s) => s.exportSnapshot);
  const importSnapshot = useControlPlane((s) => s.importSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const onExport = () => {
    const json = exportSnapshot();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'helicyn-control-plane-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Snapshot exported.');
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setStatus(importSnapshot(text) ? 'Snapshot imported.' : 'Invalid snapshot file — not applied.');
    e.target.value = '';
  };

  const onReset = () => {
    importSnapshot(JSON.stringify(createInitialSimulationState()));
    setStatus('Reset to default scenario.');
  };

  return (
    <div className="cp-shareable">
      <span className="cp-shareable__k mono">Session</span>
      <button type="button" className="cp-btn cp-btn--sm" onClick={onExport}>
        Export snapshot
      </button>
      <button type="button" className="cp-btn cp-btn--sm" onClick={() => fileRef.current?.click()}>
        Import snapshot
      </button>
      <button type="button" className="cp-btn cp-btn--sm" onClick={onReset}>
        Reset to default
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={onImportFile}
        aria-label="Import simulation snapshot"
      />
      {status && (
        <span className="cp-shareable__status mono" role="status">
          {status}
        </span>
      )}
    </div>
  );
}
