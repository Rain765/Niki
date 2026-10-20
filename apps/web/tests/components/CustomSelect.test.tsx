// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from '../../src/components/CustomSelect';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CustomSelect', () => {
  it('toggles multiple selections without closing and preserves keyboard focus', () => {
    function MultiSelect() {
      const [value, setValue] = useState(['precise']);
      return <CustomSelect multiple ariaLabel="Personality" value={value} onChange={setValue}
        options={[{ value: 'precise', label: 'Precise' }, { value: 'bold', label: 'Bold' }]} />;
    }
    render(<MultiSelect />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Bold' }));
    expect(screen.getByRole('option', { name: 'Bold' }).getAttribute('aria-selected')).toBe('true');
    expect(trigger.textContent).toBe('Precise / Bold');
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(screen.getByRole('option', { name: 'Bold' }).getAttribute('aria-selected')).toBe('false');
    expect(trigger.textContent).toBe('Precise');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('option', { name: 'Precise' }).getAttribute('aria-selected')).toBe('false');
    expect(trigger.textContent).toBe('Personality');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders the selected label and chooses an option from the portal menu', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Model"
        value="gpt-image-2"
        options={[
          { value: 'gpt-image-2', label: 'GPT Image 2' },
          { value: 'seedance', label: 'Seedance' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Model: GPT Image 2' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('option', { name: /Seedance/ }));
    expect(onChange).toHaveBeenCalledWith('seedance');
  });

  it('skips disabled options and supports keyboard selection', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Provider"
        value="openai"
        options={[
          { value: 'openai', label: 'OpenAI' },
          { value: 'disabled', label: 'Disabled', disabled: true },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Provider: OpenAI' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Custom/ }).id,
    );
    expect(trigger.getAttribute('aria-activedescendant')).not.toBe(
      screen.getByRole('option', { name: /Disabled/ }).id,
    );

    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('custom');
    expect(onChange).not.toHaveBeenCalledWith('disabled');
  });

  it('keeps keyboard navigation active state across parent rerenders with fresh options', () => {
    const onChange = vi.fn();
    const options = () => [
      { value: 'first', label: 'First' },
      { value: 'second', label: 'Second' },
      { value: 'third', label: 'Third' },
    ];
    const { rerender } = render(
      <CustomSelect
        ariaLabel="Template"
        value="first"
        options={options()}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Template: First' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Second/ }).id,
    );

    rerender(
      <CustomSelect
        ariaLabel="Template"
        value="first"
        options={options()}
        onChange={onChange}
      />,
    );

    const rerenderedTrigger = screen.getByRole('combobox', { name: 'Template: First' });
    expect(rerenderedTrigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Second/ }).id,
    );
  });

  it('does not let a stationary pointer replace the keyboard choice when the menu appears', () => {
    render(<CustomSelect ariaLabel="Template" value="first" options={[
      {value:'first',label:'First'}, {value:'second',label:'Second'}, {value:'third',label:'Third'},
    ]} onChange={vi.fn()} />);
    const trigger=screen.getByRole('combobox');
    fireEvent.keyDown(trigger,{key:'ArrowDown'});
    fireEvent.keyDown(trigger,{key:'ArrowDown'});
    const third=screen.getByRole('option',{name:'Third'});
    fireEvent.mouseEnter(third);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option',{name:'Second'}).id);
    fireEvent.mouseMove(third);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(third.id);
  });

  it('places a constrained portal menu eight pixels below its trigger', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(240);
    render(
      <CustomSelect
        ariaLabel="Ratio"
        value="9:16"
        options={[
          { value: '9:16', label: '9:16' },
          { value: '16:9', label: '16:9' },
        ]}
        menuGap={8}
        menuPlacement="bottom"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Ratio: 9:16' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: -5,
      y: 60,
      left: -5,
      top: 60,
      right: 395,
      bottom: 100,
      width: 400,
      height: 40,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);

    const menu = screen.getByRole('listbox', { name: 'Ratio' });
    expect(menu.style.top).toBe('108px');
    expect(menu.style.left).toBe('12px');
    expect(menu.style.width).toBe('296px');
    expect(menu.style.maxHeight).toBe('120px');
  });

  it('expands a portal menu to its requested minimum width and keeps it on screen', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(360);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    render(
      <CustomSelect
        ariaLabel="Product"
        value="zamloan"
        options={[
          { value: 'zamloan', label: 'Zamloan' },
          { value: 'biumoney', label: 'Biumoney' },
        ]}
        menuMinWidth={240}
        menuPlacement="bottom"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Product: Zamloan' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 150,
      y: 40,
      left: 150,
      top: 40,
      right: 250,
      bottom: 80,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);

    const menu = screen.getByRole('listbox', { name: 'Product' });
    expect(menu.style.top).toBe('84px');
    expect(menu.style.left).toBe('108px');
    expect(menu.style.width).toBe('240px');
  });
});
