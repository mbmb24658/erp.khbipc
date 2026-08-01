"use client";

import { ReactNode, CSSProperties } from "react";

// ============================================================
// ElectricBorder — animated electric border for cards
// Inspired by reactbits.dev/animations/electric-border
//
// Renders a wrapper with an animated conic-gradient border that
// flows around the content. The "electric" color flashes with
// subtle chaos for an organic, lightning-like feel.
//
// Props:
//   color        hex/oklch color of the electric arc
//   speed        animation duration in seconds (lower = faster)
//   chaos        0..1 — randomness of the arc intensity
//   thickness    border thickness in pixels
//   borderRadius corner radius in pixels (match inner card)
//   children     content to wrap
//   className    optional className for the outer wrapper
// ============================================================

interface ElectricBorderProps {
  color?: string;
  speed?: number;
  chaos?: number;
  thickness?: number;
  borderRadius?: number;
  children: ReactNode;
  className?: string;
  // When false, the component renders children without any border effect.
  // Useful so the same JSX can be used in both modern and classic modes.
  enabled?: boolean;
}

export function ElectricBorder({
  color = "#10b981",
  speed = 1.4,
  chaos = 0.18,
  thickness = 2.5,
  borderRadius = 16,
  children,
  className = "",
  enabled = true,
}: ElectricBorderProps) {
  // When disabled, just render the children with no wrapper effect.
  // This lets us keep the same JSX in modern and classic modes.
  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  // Compute CSS variables for the inner content positioning and animation
  const wrapperStyle: CSSProperties = {
    position: "relative",
    borderRadius,
    padding: thickness,
    isolation: "isolate",
  };

  // The animated gradient layer
  const arcStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius,
    padding: `${thickness}px`,
    background: `conic-gradient(from var(--eb-angle, 0deg),
      transparent 0deg,
      ${color} 20deg,
      ${color}${Math.round(chaos * 255).toString(16).padStart(2, "0")} 40deg,
      transparent 60deg,
      transparent 180deg,
      ${color}${Math.round(chaos * 180).toString(16).padStart(2, "0")} 200deg,
      ${color} 220deg,
      transparent 240deg
    )`,
    WebkitMask:
      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    animation: `eb-rotate ${speed}s linear infinite`,
    opacity: 0.85,
    pointerEvents: "none",
  };

  // Subtle glow layer (blurred version of the arc)
  const glowStyle: CSSProperties = {
    position: "absolute",
    inset: -2,
    borderRadius,
    background: `radial-gradient(circle at 50% 50%, ${color}30, transparent 70%)`,
    filter: "blur(8px)",
    opacity: 0.4,
    animation: `eb-pulse ${speed * 2}s ease-in-out infinite`,
    pointerEvents: "none",
  };

  // Inner content layer — sits above the arc
  const innerStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    borderRadius: borderRadius - thickness,
    overflow: "hidden",
  };

  return (
    <div className={className} style={wrapperStyle}>
      <div style={glowStyle} />
      <div style={arcStyle} />
      <div style={innerStyle}>{children}</div>
    </div>
  );
}

// Preset configurations for different card types (matching the
// color/speed/chaos table from the design brief)
export const ELECTRIC_PRESETS = {
  stat: { color: "#10b981", speed: 1.3, chaos: 0.18, thickness: 2.5, borderRadius: 16 },
  financial: { color: "#fbbf24", speed: 1.1, chaos: 0.12, thickness: 2, borderRadius: 16 },
  project: { color: "#3b82f6", speed: 1.6, chaos: 0.22, thickness: 3, borderRadius: 12 },
  kpi: { color: "#f97316", speed: 1.3, chaos: 0.18, thickness: 2.5, borderRadius: 16 },
  hr: { color: "#8b5cf6", speed: 1.4, chaos: 0.16, thickness: 2.5, borderRadius: 16 },
} as const;

export type ElectricPreset = keyof typeof ELECTRIC_PRESETS;
