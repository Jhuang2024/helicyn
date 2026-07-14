import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

export type CustomSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

type CustomSelectProps<T extends string = string> = {
  options: readonly CustomSelectOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  name?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  compact?: boolean;
  align?: 'start' | 'end';
  disabled?: boolean;
};

/**
 * Site-wide themed replacement for native select menus. Keeps ordinary form
 * submission through a hidden input while exposing a keyboard-operable
 * listbox to assistive technology.
 */
export function CustomSelect<T extends string = string>({
  options,
  value,
  defaultValue,
  onChange,
  name,
  ariaLabel,
  ariaLabelledBy,
  className = '',
  compact = false,
  align = 'start',
  disabled = false,
}: CustomSelectProps<T>) {
  const fallback = (defaultValue ?? options[0]?.value ?? '') as T;
  const [internalValue, setInternalValue] = useState<T>(fallback);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const generatedId = useId();
  const listboxId = `custom-select-${generatedId}`;
  const selectedValue = value ?? internalValue;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const openMenu = (index = selectedIndex) => {
    if (disabled) return;
    setActiveIndex(index);
    setOpen(true);
  };

  const choose = (nextValue: T) => {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const move = (delta: number) => {
    setActiveIndex((current) => (current + delta + options.length) % options.length);
  };

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowDown'
        ? (selectedIndex + 1) % options.length
        : (selectedIndex - 1 + options.length) % options.length);
    }
  };

  const onOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[index];
      if (option) choose(option.value);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div
      className={[
        'custom-select',
        compact ? 'custom-select--compact' : '',
        align === 'end' ? 'custom-select--end' : '',
        open ? 'is-open' : '',
        className,
      ].filter(Boolean).join(' ')}
      ref={rootRef}
    >
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <button
        ref={buttonRef}
        type="button"
        className="custom-select__trigger"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="custom-select__value">{selected?.label}</span>
        <svg className="custom-select__chevron" viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1.25 6 6.25l5-5" />
        </svg>
      </button>

      {open && (
        <div className="custom-select__menu" id={listboxId} role="listbox">
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              className={[
                'custom-select__option',
                option.value === selectedValue ? 'is-selected' : '',
                index === activeIndex ? 'is-active' : '',
              ].filter(Boolean).join(' ')}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => choose(option.value)}
              onMouseEnter={() => setActiveIndex(index)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              <span>
                <span className="custom-select__option-label">{option.label}</span>
                {option.description && (
                  <span className="custom-select__option-description">{option.description}</span>
                )}
              </span>
              <svg className="custom-select__check" viewBox="0 0 14 11" aria-hidden="true">
                <path d="m1 5.5 4 4L13 1" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
