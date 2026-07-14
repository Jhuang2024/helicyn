import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ControlPlaneShell } from './ControlPlaneShell';
import { useControlPlane } from '@/state/controlPlaneStore';
import { createInitialSimulationState } from '@/simulation';

function renderShell(initialEntries: string[] = ['/control-plane']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ControlPlaneShell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useControlPlane.setState({ sim: createInitialSimulationState(), previewPath: null });
});

const get = () => useControlPlane.getState();

describe('Control Plane app shell', () => {
  it('renders a focused canvas with detail surfaces collapsed by default', () => {
    renderShell();
    expect(screen.getByRole('heading', { name: 'Helicyn Control Plane' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Control Plane views' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Visualization canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(screen.queryByRole('log', { name: 'Simulation events' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inspector scenario/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the scenario inspector with decision trace on demand', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /Inspector scenario/ }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Normal Operations')).toBeInTheDocument();
    expect(within(inspector).getByText('Decision trace')).toBeInTheDocument();
  });

  it('selecting a region updates the inspector', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=regions']);
    await user.click(screen.getAllByRole('button', { name: /US-WEST region detail/ })[0]!);
    expect(get().sim.selectedEntity).toEqual({ type: 'region', id: 'oregon' });
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('OREGON')).toBeInTheDocument();
    expect(within(inspector).getByText('Compute load')).toBeInTheDocument();
    expect(within(inspector).getByText('Available capacity')).toBeInTheDocument();
  });

  it('selecting a workload updates the inspector and offers staging', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=workloads']);
    await user.click(screen.getAllByTitle('Inspect this workload')[0]!);
    expect(get().sim.selectedEntity?.type).toBe('workload');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Current placement')).toBeInTheDocument();
    expect(within(inspector).getByRole('button', { name: /Stage:/ })).toBeInTheDocument();
  });

  it('approving a recommendation updates queue, event stream, and status', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=recommendations']);
    const recId = get().sim.recommendations[0]!.id;
    await user.click(screen.getAllByRole('button', { name: 'Approve in simulation' })[0]!);
    expect(get().sim.queue).toHaveLength(1);
    // Approval event appears exactly once in the stream.
    await user.click(screen.getByRole('button', { name: /Event stream/ }));
    const log = screen.getByRole('log', { name: 'Simulation events' });
    expect(within(log).getAllByText('Operator approved')).toHaveLength(1);
    expect(get().sim.events.filter((e) => e.category === 'approval' && e.recId === recId)).toHaveLength(1);
    // Control-bar status reflects the staged decision.
    expect(screen.getByText('Action staged · decision in flight')).toBeInTheDocument();
  });

  it('changing views preserves simulation state', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=recommendations']);
    await user.click(screen.getAllByRole('button', { name: 'Approve in simulation' })[0]!);
    const before = get().sim;
    const nav = screen.getByRole('navigation', { name: 'Control Plane views' });
    await user.click(within(nav).getByRole('button', { name: 'Results' }));
    expect(get().sim).toBe(before);
    // The queue rendered in the Verification view shows the approved item.
    expect(screen.getByText(/Pending review/)).toBeInTheDocument();
    expect(screen.queryByText('No actions awaiting simulation.')).not.toBeInTheDocument();
  });

  it('selecting an event updates the inspector with linked entities', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=recommendations']);
    await user.click(screen.getAllByRole('button', { name: 'Approve in simulation' })[0]!);
    await user.click(screen.getByRole('button', { name: /Event stream/ }));
    const log = screen.getByRole('log', { name: 'Simulation events' });
    await user.click(within(log).getByText('Operator approved'));
    expect(get().sim.selectedEntity?.type).toBe('event');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Related entities')).toBeInTheDocument();
    expect(within(inspector).getByText('Linked recommendation')).toBeInTheDocument();
  });

  it('selecting a recommendation shows its full detail and affected regions', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=recommendations']);
    const recId = get().sim.recommendations[0]!.id;
    await user.click(screen.getByRole('button', { name: recId }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Simulated effect')).toBeInTheDocument();
    expect(within(inspector).getByText('Affected regions')).toBeInTheDocument();
    // Clicking an affected region chip re-targets the inspector to the region.
    await user.click(within(inspector).getAllByRole('button', { name: /VIRGINIA|OREGON/ })[0]!);
    expect(get().sim.selectedEntity?.type).toBe('region');
  });

  it('escape clears the selection', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=regions']);
    await user.click(screen.getAllByRole('button', { name: /US-WEST region detail/ })[0]!);
    expect(get().sim.selectedEntity).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(get().sim.selectedEntity).toBeNull();
  });

  it('rerun scenario resets deterministically without duplicating events', async () => {
    const user = userEvent.setup();
    renderShell(['/control-plane?view=recommendations']);
    await user.click(screen.getAllByRole('button', { name: 'Approve in simulation' })[0]!);
    await user.click(screen.getByRole('button', { name: 'More controls' }));
    await user.click(screen.getByRole('button', { name: 'Restart scenario' }));
    const sim = get().sim;
    expect(sim.queue).toHaveLength(0);
    expect(sim.recommendations.every((r) => r.state === 'proposed')).toBe(true);
    // Seeded backstory + the scenario-loaded system event, nothing duplicated.
    const ids = sim.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('baseline toggle in the control bar drives all metric values', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Original plan' }));
    expect(get().sim.controls.view).toBe('baseline');
    await user.click(screen.getByRole('button', { name: 'Helicyn plan' }));
    expect(get().sim.controls.view).toBe('after');
  });
});
