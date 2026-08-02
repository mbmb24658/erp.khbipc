"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// PageTransition — wraps page content with smooth enter animation
//
// Animates:
//   - Fade in (opacity 0 → 1)
//   - Slide up (y: 8px → 0)
//   - Duration: 250ms with soft easing
//
// Re-triggers on pathname change.
// Respects prefers-reduced-motion (handled by framer-motion).
// ============================================================

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Avoid SSR hydration mismatch — return children as-is on first render
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: 0.25,
          ease: [0.22, 1, 0.36, 1], // matches --ease-out-soft
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================
// StaggerGroup — for staggering children of a list/grid
// ============================================================

interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  delay?: number; // delay between items in ms
}

export function StaggerGroup({ children, className, delay = 40 }: StaggerGroupProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: delay / 1000,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// StaggerItem — child of StaggerGroup
// ============================================================

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.25,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// CardHover — for card hover effects (scale + shadow)
// ============================================================

interface CardHoverProps {
  children: ReactNode;
  className?: string;
  href?: string;
}

export function CardHover({ children, className }: CardHoverProps) {
  return (
    <motion.div
      className={className}
      whileHover={{
        y: -2,
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
      }}
      whileTap={{ scale: 0.99 }}
    >
      {children}
    </motion.div>
  );
}
