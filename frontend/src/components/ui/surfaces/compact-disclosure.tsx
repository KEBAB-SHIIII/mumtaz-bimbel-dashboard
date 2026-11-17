import type { ReactNode } from 'react';
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';

export function CompactDisclosure({title, count, icon, children}: {title:string; count?:number | undefined; icon:ReactNode; children:ReactNode}) {
  const reduceMotion = useReducedMotion();
  return <Disclosure>{({open})=><div>
    <DisclosureButton className="group flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-start text-sm font-medium transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none">
      <span className="text-muted">{icon}</span><span className="flex-1">{title}</span>
      {count !== undefined && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-muted">{count}</span>}
      <ChevronDown aria-hidden className="size-4 text-muted transition-transform duration-200 group-data-[open]:rotate-180 motion-reduce:transition-none" />
    </DisclosureButton>
    <AnimatePresence initial={false}>{open && <m.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduceMotion?0:0.2,ease:'easeOut'}} className="overflow-hidden">
      <DisclosurePanel static className="px-2 pt-1 pb-3">{children}</DisclosurePanel>
    </m.div>}</AnimatePresence>
  </div>}</Disclosure>;
}

