import { useEffect, useId, useState } from 'react';
import DOMPurify from 'dompurify';

// Mermaid has global configuration: serialize rendering so themes cannot leak between jobs.
let renderQueue: Promise<unknown> = Promise.resolve();
export function MermaidDiagram({ source }: { source: string }) {
  const id = `note-diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const [result, setResult] = useState<{
    source: string;
    theme: string | undefined;
    svg?: string;
    error?: string;
  }>();
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const job = async () => {
        if (cancelled) return;
        let staging: HTMLDivElement | undefined;
        try {
          if (source.length > 20000)
            throw new Error('Divide este diagrama: el límite es de 20 000 caracteres.');
          // Keep shared notes local: authors cannot change the renderer policy or load images/CSS.
          if (
            /^\s*---|%%\s*\{|<\s*\/?\s*(?:img|image|iframe|video|audio|style|script)\b|@import|url\s*\(|@\{[^}]*\bimg\s*:/i.test(
              source,
            )
          )
            throw new Error(
              'Usa sintaxis Mermaid sin configuración embebida, imágenes ni recursos externos.',
            );
          const { default: mermaid } = await import('mermaid');
          if (cancelled) return;
          await document.fonts.ready;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            suppressErrorRendering: true,
            theme: theme === 'dark' ? 'dark' : 'default',
            htmlLabels: false,
            fontFamily: 'Inter, sans-serif',
            maxTextSize: 20000,
            maxEdges: 300,
            flowchart: { htmlLabels: false },
          });
          await mermaid.parse(source);
          if (cancelled) return;
          staging = document.createElement('div');
          staging.className = 'mermaid-staging';
          staging.setAttribute('aria-hidden', 'true');
          document.body.append(staging);
          const { svg } = await mermaid.render(id, source, staging);
          const safeSvg = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: ['foreignObject', 'image', 'a', 'script'],
            FORBID_ATTR: ['href', 'xlink:href'],
          });
          if (!cancelled) setResult({ source, theme, svg: safeSvg });
        } catch (error) {
          if (!cancelled)
            setResult({
              source,
              theme,
              error: error instanceof Error ? error.message : 'Revisa la sintaxis del diagrama.',
            });
        } finally {
          staging?.remove();
        }
      };
      renderQueue = renderQueue.then(job, job);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, theme, id]);
  const current = result?.source === source && result.theme === theme ? result : undefined;
  return (
    <figure
      className="mermaid-diagram"
      data-diagram-state={!current ? 'pending' : current.error ? 'error' : 'ready'}
      aria-label="Diagrama Mermaid"
    >
      {!current ? (
        <p role="status">Preparando diagrama…</p>
      ) : current.error ? (
        <>
          <p className="mermaid-error" role="status">
            No se pudo dibujar el diagrama. {current.error}
          </p>
          <pre>
            <code>{source}</code>
          </pre>
        </>
      ) : (
        <div
          className="mermaid-svg"
          style={{
            background: theme === 'dark' ? '#1a1b25' : '#ffffff',
            printColorAdjust: 'exact',
          }}
          dangerouslySetInnerHTML={{ __html: current.svg! }}
        />
      )}
    </figure>
  );
}

export async function waitForDiagrams(element: HTMLElement | null) {
  const deadline = Date.now() + 30000;
  while (element?.querySelector('[data-diagram-state="pending"]')) {
    if (Date.now() > deadline)
      throw new Error('Espera a que termine la vista previa antes de exportar.');
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}
