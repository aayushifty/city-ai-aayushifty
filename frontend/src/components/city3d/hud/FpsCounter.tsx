import React, { useEffect, useState } from 'react';

/** Frames per second of the page (sampled once a second), to keep an eye on rendering cost. */
export const FpsCounter: React.FC = () => {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (fps === null) return null;
  const color = fps >= 50 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-red-300';
  return <span className={`font-mono text-[10px] font-bold ${color}`} title="Frames per second">{fps} FPS</span>;
};
