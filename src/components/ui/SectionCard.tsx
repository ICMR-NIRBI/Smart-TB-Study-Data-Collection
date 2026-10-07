import React, { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function SectionCard({ title, subtitle, defaultOpen = true, forceOpen, badge, children }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section className="rounded-2xl border border-line bg-white">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-ink">{title}</span>
            {subtitle && <span className="mt-0.5 block text-sm font-normal text-ink-muted">{subtitle}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {badge}
            <ChevronDownIcon
              className={`h-5 w-5 text-ink-muted transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line px-4 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
