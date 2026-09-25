import { memo, useEffect, useRef } from 'react';

// Bounded resolution and 30 fps keep the visual layer light on phones. Hidden tabs stop drawing.
function useCanvas(
  animated: boolean,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const render = useRef(draw);
  render.current = draw;
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let elapsed = 0;
    let last = 0;
    let width = 1;
    let height = 1;
    const paint = () => render.current(ctx, width, height, elapsed / 1000);
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        elapsed += Math.min(now - last, 80);
        last = now;
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      const running = animated && !motion.matches && document.visibilityState === 'visible';
      canvas.dataset.animating = String(running);
      if (document.visibilityState === 'visible') paint();
      if (running) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      restart();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    motion.addEventListener('change', restart);
    document.addEventListener('visibilitychange', restart);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [animated, draw]);
  return ref;
}

function random(index: number) {
  const n = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function polygon(ctx: CanvasRenderingContext2D, radius: number, sides: number) {
  ctx.beginPath();
  if (!sides) ctx.arc(0, 0, radius, 0, Math.PI * 2);
  else {
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
}

export const FocusBackdrop = memo(function FocusBackdrop({
  theme,
  color,
  shape,
  animated,
}: {
  theme: string;
  color: string;
  shape: string;
  animated: boolean;
}) {
  const canvas = useCanvas(animated, (ctx, w, h, time) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0D1020';
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.2,
      0,
      w * 0.5,
      h * 0.2,
      Math.max(w, h) * 0.8,
    );
    glow.addColorStop(0, `${color}29`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    if (theme === 'breeze') {
      for (let band = 0; band < 7; band++) {
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 16) {
          const y =
            h * (0.18 + band * 0.075) +
            Math.sin((x / Math.max(w, 1)) * 5 + time * 0.18 + band * 0.4) * h * 0.13;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `${color}${['18', '27', '38', '45', '38', '27', '18'][band]}`;
        ctx.lineWidth = 24 + band * 6;
        ctx.stroke();
      }
      return;
    }
    if (theme === 'codeRain') {
      const glyphs = '{}[]01<>/;=+*';
      ctx.font = '14px ui-monospace, Consolas, monospace';
      for (let column = 0; column < Math.ceil(w / 34); column++) {
        const y =
          ((random(column) * (h + 250) + time * (12 + random(column + 90) * 14)) % (h + 250)) - 100;
        for (let row = 0; row < 9; row++) {
          ctx.globalAlpha = (1 - row / 10) * 0.5;
          ctx.fillStyle = row === 0 ? '#EEEAFE' : color;
          ctx.fillText(
            glyphs[Math.floor(random(column * 15 + row) * glyphs.length)] ?? '0',
            column * 34 + 10,
            y - row * 22,
          );
        }
      }
      ctx.globalAlpha = 1;
      return;
    }
    const count = w < 600 ? 32 : 62;
    const points = Array.from({ length: count }, (_, i) => ({
      x: ((random(i) * w + time * (3 + random(i + 70) * 6)) % (w + 60)) - 30,
      y:
        ((((random(i + 40) * h - time * (4 + random(i + 30) * 8)) % (h + 60)) + h + 60) %
          (h + 60)) -
        30,
    }));
    if (theme === 'constellation') {
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++) {
          const a = points[i]!;
          const b = points[j]!;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 145) continue;
          ctx.globalAlpha = (1 - distance / 145) * 0.35;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
    }
    points.forEach((point, i) => {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(time * 0.06 + i);
      if (theme === 'geometry') {
        const sides =
          shape === 'mixed'
            ? [0, 3, 4, 6][i % 4]
            : ({ circles: 0, triangles: 3, squares: 4, hexagons: 6 }[shape] ?? 6);
        polygon(ctx, 6 + random(i + 10) * 17, sides ?? 6);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.08;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      } else {
        const size = theme === 'fireflies' ? 2 + random(i + 10) * 5 : 1.7;
        ctx.globalAlpha = 0.35 + (Math.sin(time * 0.5 + i) + 1) * 0.15;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = theme === 'fireflies' ? 18 : 7;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  });
  return <canvas ref={canvas} className="focus-backdrop-canvas" aria-hidden="true" />;
});

export const SpectrumRing = memo(function SpectrumRing({
  analyser,
  color,
  animated,
}: {
  analyser: AnalyserNode | null;
  color: string;
  animated: boolean;
}) {
  const data = useRef(new Uint8Array(1024));
  const canvas = useCanvas(animated, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (analyser && analyser.context.state === 'running')
      analyser.getByteFrequencyData(data.current);
    else data.current.fill(0);
    const radius = Math.min(w, h) * 0.39;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, w / 170);
    ctx.lineCap = 'round';
    // Logarithmic bands from 40 Hz to 16 kHz, reflected for a balanced circular spectrum.
    for (let i = 0; i < 96; i++) {
      const band = i < 48 ? i : 95 - i;
      const low = 40 * Math.pow(400, band / 48);
      const high = 40 * Math.pow(400, (band + 1) / 48);
      const binHz = analyser ? analyser.context.sampleRate / analyser.fftSize : 24;
      const start = Math.max(1, Math.floor(low / binHz));
      const end = Math.min(data.current.length - 1, Math.max(start, Math.ceil(high / binHz)));
      let sum = 0;
      for (let index = start; index <= end; index++) sum += data.current[index] ?? 0;
      const level = end >= start ? sum / (end - start + 1) / 255 : 0;
      const length = 2 + level * Math.min(w, h) * 0.08;
      const angle = (i / 96) * Math.PI * 2 - Math.PI / 2;
      ctx.globalAlpha = analyser ? 0.4 + level * 0.6 : 0.25;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(angle) * radius, h / 2 + Math.sin(angle) * radius);
      ctx.lineTo(
        w / 2 + Math.cos(angle) * (radius + length),
        h / 2 + Math.sin(angle) * (radius + length),
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  return <canvas ref={canvas} className="focus-spectrum" aria-hidden="true" />;
});
