// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectField } from '../../src/components/SelectField';

afterEach(cleanup);

describe('SelectField', () => {
  it('uses its visible field label as the accessible name', () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Product"
        value="zamloan"
        options={[
          { value: 'zamloan', label: 'Zamloan' },
          { value: 'biumoney', label: 'Biumoney' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Product' });
    expect(trigger.className).toContain('od-control-select__trigger');
    expect(trigger.getAttribute('value')).toBe('zamloan');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Biumoney' }));
    expect(onChange).toHaveBeenCalledWith('biumoney');
  });
});
