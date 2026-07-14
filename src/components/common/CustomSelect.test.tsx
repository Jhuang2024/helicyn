import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomSelect } from './CustomSelect';

const OPTIONS = [
  { value: '', label: 'Select one' },
  { value: 'operator', label: 'Operator' },
  { value: 'researcher', label: 'Researcher' },
] as const;

describe('CustomSelect', () => {
  it('selects an option and preserves native form submission semantics', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(
      <form onSubmit={(event) => {
        event.preventDefault();
        submitted(Object.fromEntries(new FormData(event.currentTarget)));
      }}>
        <CustomSelect name="relationship" ariaLabel="Relationship" options={OPTIONS} />
        <button type="submit">Submit</button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Relationship' }));
    await user.click(screen.getByRole('option', { name: 'Operator' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(submitted).toHaveBeenCalledWith({ relationship: 'operator' });
  });

  it('supports arrow-key navigation and selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CustomSelect ariaLabel="Role" options={OPTIONS} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: 'Role' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('researcher');
    expect(trigger).toHaveTextContent('Researcher');
  });
});
