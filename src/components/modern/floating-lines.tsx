"use client";

import { useEffect, useRef, ReactNode } from "react";

// ============================================================
// FloatingLines — animated background with flowing lines
// Inspired by reactbits.dev/backgrounds/floating-lines
//
// Uses a canvas to draw N lines that drift slowly across the
// screen with subtle color variation. Responds to mouse
// movement when `interactive` is true.
//
// Designed to sit behind page content (z-index: -1, position: fixed).
// ============================================================

interface FloatingLinesProps {
  lineCount?: number;
  speed?: number;
  colors?: string[];
  interactive?: boolean;
  thickness?: number;
  opacity?: number;
  // Children optional — if provided, renders as a relative container
  // with the lines as background. If not, renders a fixed full-screen bg.
  children?: ReactNode;
  className?: string;
}

interface Line {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  color: string;
  phase: number;
}

export function FloatingLines({
  lineCount = 18,
  speed = 0.4,
  colors = ["#10b981", "#3b82f6", "#8b5cf6"],
  interactive = true,
  thickness = 1.5,
  opacity = 0.5,
  children,
  className = "",
}: FloatingLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<Line[]>([]);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Initialize lines with random positions/velocities
    linesRef.current = Array.from({ length: lineCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const sp = speed * (0.5 + Math.random() * 0.8);
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        length: 60 + Math.random() * 180,
        color: colors[Math.floor(Math.random() * colors.length)],
        phase: Math.random() * Math.PI * 2,
      };
    });

    let frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      for (const line of linesRef.current) {
        // Update position
        line.x += line.vx;
        line.y += line.vy;
        line.phase += 0.01;

        // Bounce off edges
        if (line.x < -line.length) line.x = width + line.length;
        if (line.x > width + line.length) line.x = -line.length;
        if (line.y < -line.length) line.y = height + line.length;
        if (line.y > height + line.length) line.y = -line.length;

        // Mouse repulsion (gentle)
        if (interactive && mouseRef.current.active) {
          const dx = line.x - mouseRef.current.x;
          const dy = line.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150 && dist > 0) {
            const force = (150 - dist) / 150;
            line.vx += (dx / dist) * force * 0.05;
            line.vy += (dy / dist) * force * 0.05;
          }
        }

        // Dampen velocity to prevent runaway acceleration
        const mag = Math.sqrt(line.vx * line.vx + line.vy * line.vy);
        const maxMag = speed * 2;
        if (mag > maxMag) {
          line.vx = (line.vx / mag) * maxMag;
          line.vy = (line.vy / mag) * maxMag;
        }

        // Draw a curved line with a gradient
        const angle = Math.atan2(line.vy, line.vx);
        const tailX = line.x - Math.cos(angle) * line.length;
        const tailY = line.y - Math.sin(angle) * line.length;

        const gradient = ctx.createLinearGradient(
          tailX,
          tailY,
          line.x,
          line.y
        );
        gradient.addColorStop(0, `${line.color}00`);
        gradient.addColorStop(0.5, `${line.color}80`);
        gradient.addColorStop(1, `${line.color}00`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = thickness;
        ctx.lineCap = "round";
        ctx.globalAlpha =
          opacity * (0.5 + 0.5 * Math.sin(line.phase));

        ctx.beginPath();
        // Curved line using a quadratic bezier
        const cpX =
          (tailX + line.x) / 2 +
          Math.cos(line.phase * 0.5) * 20;
        const cpY =
          (tailY + line.y) / 2 +
          Math.sin(line.phase * 0.5) * 20;
        ctx.moveTo(tailX, tailY);
        ctx.quadraticCurveTo(cpX, cpY, line.x, line.y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();

    const handleResize = () => resize();
    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };
    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("resize", handleResize);
    if (interactive) {
      window.addEventListener("mousemove", handleMouse);
      window.addEventListener("mouseout", handleMouseLeave);
    }

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
      if (interactive) {
        window.removeEventListener("mousemove", handleMouse);
        window.removeEventListener("mouseout", handleMouseLeave);
      }
    };
  }, [lineCount, speed, colors, interactive, thickness, opacity]);

  // If children provided, render as relative container with bg
  if (children) {
    return (
      <div className={`relative ${className}`}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
        />
        <div className="relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </div>
    );
  }

  // Otherwise render as fixed full-screen background
  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
