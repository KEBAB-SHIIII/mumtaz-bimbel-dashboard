import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export function SessionDisclosure({ count, defaultOpen, children }: { count: number; defaultOpen: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <Disclosure defaultOpen={defaultOpen}>
      {({ open }) => (
        <>
          <DisclosureButton className="group flex h-11 w-full items-center justify-between border-t border-border px-4 text-start text-sm font-medium text-primary transition-colors duration-150 hover:bg-surface-muted focus-visible:-outline-offset-2 sm:px-5 motion-reduce:transition-none">
            Rincian sesi ({count})
            <ChevronDown aria-hidden className="size-4 transition-transform duration-300 group-data-[open]:rotate-180 motion-reduce:transition-none" />
          </DisclosureButton>
          <AnimatePresence initial={false}>
            {open && (
              <m.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <DisclosurePanel static className="border-t border-border">{children}</DisclosurePanel>
              </m.div>
            )}
          </AnimatePresence>
        </>
      )}
    </Disclosure>
  );
}

