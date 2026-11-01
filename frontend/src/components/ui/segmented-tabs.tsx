import { Radio, RadioGroup, Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { m } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Pegas indikator "pil" yang meluncur (docs/design/02-tokens.md). */
const INDICATOR_SPRING = { type: 'spring', stiffness: 400, damping: 32 } as const;

const TRACK = 'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-0.5';
const ITEM =
  'relative h-8 shrink-0 rounded-[0.375rem] px-3 text-sm font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:text-text pointer-coarse:h-10 motion-reduce:transition-none data-checked:text-text data-selected:text-text focus-visible:-outline-offset-2';

function Indicator({ layoutId }: { layoutId: string }) {
  return (
    <m.span
      aria-hidden
      layoutId={layoutId}
      transition={INDICATOR_SPRING}
      className="absolute inset-0 -z-10 rounded-[inherit] bg-surface shadow-sm ring-1 ring-border forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-solid"
    />
  );
}

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

interface SegmentedControlProps<V extends string> {
  /** Nama grup untuk pembaca layar, mis. "Rentang waktu". */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/**
 * Filter cepat (chip segmented Ref 2): satu pilihan aktif dari beberapa opsi. Semantik radio group
 * (panah kiri/kanan berpindah pilihan). Untuk mengganti isi tampilan, pakai `SegmentedTabs`.
 */
export function SegmentedControl<V extends string>({ label, options, value, onChange, className }: SegmentedControlProps<V>) {
  const layoutId = useId();
  return (
    <RadioGroup value={value} onChange={onChange} aria-label={label} className={cn(TRACK, 'isolate', className)}>
      {options.map((option) => (
        <Radio key={option.value} value={option.value} className={cn(ITEM, 'cursor-pointer')}>
          {({ checked }) => (
            <>
              {checked && <Indicator layoutId={layoutId} />}
              {option.label}
            </>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}

export interface SegmentedTab {
  key: string;
  label: string;
  content: ReactNode;
}

interface SegmentedTabsProps {
  label: string;
  tabs: readonly SegmentedTab[];
  selectedIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  listClassName?: string;
}

/**
 * Tab segmented abu-abu (Ref 3) dengan indikator meluncur dan isi yang berganti: isi baru fade + naik 6px
 * 200ms. Reduced motion: hanya fade.
 */
export function SegmentedTabs({ label, tabs, selectedIndex, onChange, className, listClassName }: SegmentedTabsProps) {
  const layoutId = useId();
  return (
    <TabGroup
      {...(selectedIndex === undefined ? {} : { selectedIndex })}
      {...(onChange ? { onChange } : {})}
      className={cn('flex flex-col gap-4', className)}
    >
      <TabList aria-label={label} className={cn(TRACK, 'isolate self-start', listClassName)}>
        {tabs.map((tab) => (
          <Tab key={tab.key} className={ITEM}>
            {({ selected }) => (
              <>
                {selected && <Indicator layoutId={layoutId} />}
                {tab.label}
              </>
            )}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {tabs.map((tab) => (
          <TabPanel key={tab.key} className="focus-visible:outline-offset-4">
            {/* Headless UI melepas panel lama seketika, jadi hanya isi baru yang beranimasi (fade + naik 6px). */}
            <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {tab.content}
            </m.div>
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
