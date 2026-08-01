"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ============================================================
// LineSidebar — proximity-reactive sidebar
// Inspired by reactbits.dev/components/line-sidebar
//
// Features:
// - Items shift horizontally based on mouse proximity
// - Marker line grows next to hovered item
// - Color transitions to accent on near items
// - Each item is a Next.js Link (navigation)
// - RTL-aware (items shift toward the start, not end)
// ============================================================

export interface LineSidebarItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  // Optional badge content (e.g., notification count)
  badge?: React.ReactNode;
  // Whether the route is currently active
  active?: boolean;
  // Click handler (in addition to navigation)
  onClick?: () => void;
}

interface LineSidebarProps {
  items: LineSidebarItem[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: "linear" | "smooth" | "sharp";
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  className?: string;
}

export function LineSidebar({
  items,
  accentColor = "#10b981",
  textColor = "#94a3b8",
  markerColor = "#334155",
  showIndex = false,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 20,
  falloff = "smooth",
  markerLength = 60,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 8,
  fontSize = 1.1,
  smoothing = 100,
  className = "",
}: LineSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Track mouse Y position relative to the sidebar container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (e: globalThis.MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      // Only respond when mouse is within reasonable distance of sidebar
      const x = e.clientX - rect.left;
      // In RTL layout, the sidebar is on the right side of the screen
      // so we want to track mouse when it's near the sidebar horizontally too
      if (x >= -100 && x <= rect.width + 100) {
        setMouseY(y);
      } else {
        setMouseY(null);
      }
    };

    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  // Compute proximity factor (0..1) for a given item index
  const computeProximity = (index: number): number => {
    if (mouseY === null) return 0;
    const el = itemRefs.current[index];
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return 0;
    const itemCenterY = rect.top + rect.height / 2 - containerRect.top;
    const distance = Math.abs(mouseY - itemCenterY);
    if (distance >= proximityRadius) return 0;
    const t = 1 - distance / proximityRadius;
    // Apply falloff curve
    switch (falloff) {
      case "linear":
        return t;
      case "sharp":
        return t * t;
      case "smooth":
      default:
        return t * t * (3 - 2 * t); // smoothstep
    }
  };

  // Smoothing: use CSS transitions with the `smoothing` duration
  const transitionStyle = {
    transition: `transform ${smoothing}ms ease-out, color ${smoothing}ms ease-out, opacity ${smoothing}ms ease-out`,
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex flex-col", className)}
      style={{ gap: `${itemGap}px` }}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const proximity = computeProximity(index);
        const isHovered = hoveredIndex === index;
        const isActive = item.active;

        // Compute visual state
        const shift = proximity * maxShift;
        // In RTL, the items are on the right; we want them to shift LEFT (toward content)
        // when mouse is near (so they appear to "lean into" the hover)
        const shiftTransform = `translateX(${-shift}px)`;

        // Color interpolation
        const colorMix = proximity;
        const itemColor = isActive
          ? accentColor
          : isHovered
          ? accentColor
          : mixColors(textColor, accentColor, colorMix * 0.7);

        // Marker state
        const markerOpacity = isActive ? 1 : Math.max(0.2, proximity);
        const markerHeight =
          markerLength * (scaleTick && proximity > 0 ? 1 + proximity * 0.5 : 1);
        const tickHeight = markerLength * tickScale * (scaleTick ? 1 + proximity * 0.3 : 1);

        return (
          <div
            key={item.href}
            className="relative flex items-center"
            style={{ gap: `${markerGap}px` }}
          >
            {/* Marker line (on the right side in RTL) */}
            {showMarker && (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  width: 2,
                  height: markerHeight,
                  background: isActive
                    ? accentColor
                    : mixColors(markerColor, accentColor, proximity),
                  opacity: markerOpacity,
                  borderRadius: 1,
                  ...transitionStyle,
                }}
              >
                {/* Tick mark (smaller line beside the main marker) */}
                {proximity > 0.1 && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{
                      right: 6,
                      width: 1,
                      height: tickHeight,
                      background: accentColor,
                      opacity: proximity * 0.6,
                      ...transitionStyle,
                    }}
                  />
                )}
              </div>
            )}

            {/* Item */}
            <div
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="contents"
            >
              <Link
                href={item.href}
                onClick={item.onClick}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-right flex-1 min-w-0 group no-underline"
                style={{
                  transform: shiftTransform,
                  color: itemColor,
                  fontSize: `${fontSize}rem`,
                  ...transitionStyle,
                }}
              >
                {showIndex && (
                  <span
                    className="text-[10px] opacity-50 font-mono shrink-0"
                    style={{ ...transitionStyle }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                {Icon && (
                  <Icon
                    className="shrink-0"
                    style={{
                      width: 18,
                      height: 18,
                      color: itemColor,
                      ...transitionStyle,
                    }}
                  />
                )}
                <span className="flex-1 truncate text-[13px]">{item.label}</span>
                {item.badge}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper: mix two hex colors by a factor 0..1
function mixColors(a: string, b: string, t: number): string {
  try {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    if (!pa || !pb) return b;
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  } catch {
    return b;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}
