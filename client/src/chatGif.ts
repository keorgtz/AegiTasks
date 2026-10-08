export interface RemoteGif {
  url: string;
  provider: string;
}
const providers: Record<string, string> = {
  'static.klipy.com': 'KLIPY',
  'static1.klipy.com': 'KLIPY',
  'static2.klipy.com': 'KLIPY',
  'media.tenor.com': 'Tenor',
  'media1.tenor.com': 'Tenor',
  'c.tenor.com': 'Tenor',
  'media.giphy.com': 'GIPHY',
  'media0.giphy.com': 'GIPHY',
  'media1.giphy.com': 'GIPHY',
  'media2.giphy.com': 'GIPHY',
  'media3.giphy.com': 'GIPHY',
  'media4.giphy.com': 'GIPHY',
  'i.giphy.com': 'GIPHY',
};
export function remoteGif(value: string): RemoteGif | null {
  try {
    const url = new URL(value);
    const provider = Object.hasOwn(providers, url.hostname) ? providers[url.hostname] : undefined;
    if (
      !provider ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !url.pathname.toLowerCase().endsWith('.gif')
    )
      return null;
    return { url: value, provider };
  } catch {
    return null;
  }
}
export function gifLinks(body: string) {
  return Array.from(
    new Map(
      (body.match(/https:\/\/[^\s<>"']+/g) || []).flatMap((value) => {
        const gif = remoteGif(value);
        return gif ? [[gif.url, gif] as const] : [];
      }),
    ).values(),
  ).slice(0, 5);
}
export function withoutGifLinks(body: string) {
  return gifLinks(body)
    .reduce((text, gif) => text.replaceAll(gif.url, ''), body)
    .trim();
}
export function transferredGif(transfer: DataTransfer): RemoteGif | null {
  const direct = gifLinks(transfer.getData('text/plain') || transfer.getData('text/uri-list'))[0];
  if (direct) return direct;
  const html = transfer.getData('text/html');
  if (html.length > 100000) return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const image of template.content.querySelectorAll('img')) {
    const gif = remoteGif(image.getAttribute('src') || '');
    if (gif) return gif;
  }
  return null;
}
export interface CatalogueGif {
  id: string;
  title: string;
  url: string;
  preview: string;
  slug: string;
}
export interface CataloguePage {
  items: CatalogueGif[];
  hasNext: boolean;
}
export async function searchKlipy(
  key: string,
  query: string,
  page: number,
  signal: AbortSignal,
): Promise<CataloguePage> {
  let customer: string;
  try {
    customer = sessionStorage.getItem('aegitasks-klipy-session') || crypto.randomUUID();
    sessionStorage.setItem('aegitasks-klipy-session', customer);
  } catch {
    customer = crypto.randomUUID();
  }
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) abort.abort();
  const timeout = setTimeout(cancel, 8000);
  try {
    const params = new URLSearchParams({
      page: String(page),
      per_page: '12',
      locale: 'es',
      customer_id: customer,
    });
    if (query.trim()) params.set('q', query.trim());
    const response = await fetch(
      `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${query.trim() ? 'search' : 'trending'}?${params}`,
      {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: abort.signal,
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'El catálogo alcanzó su límite de consultas. Intenta más tarde.'
          : 'No se pudo consultar KLIPY. Inténtalo nuevamente.',
      );
    const result = await response.json();
    if (!result.result || !Array.isArray(result.data?.data))
      throw new Error('KLIPY devolvió una respuesta no válida.');
    const items = result.data.data.map(
      (item: {
        id: number | string;
        title: string;
        slug: string;
        type?: string;
        file?: { hd?: { gif?: { url?: string } }; sm?: { gif?: { url?: string } } };
      }) => {
        const url = item.file?.hd?.gif?.url;
        const preview = item.file?.sm?.gif?.url || url;
        if (
          !url ||
          !preview ||
          remoteGif(url)?.provider !== 'KLIPY' ||
          remoteGif(preview)?.provider !== 'KLIPY' ||
          !item.slug ||
          item.type === 'ad'
        )
          throw new Error('La configuración de KLIPY debe usar el catálogo de GIFs sin anuncios.');
        return {
          id: String(item.id),
          title: item.title || 'GIF de KLIPY',
          slug: item.slug,
          url,
          preview,
        };
      },
    );
    return { items, hasNext: result.data.has_next === true };
  } catch (error) {
    if (!signal.aborted && abort.signal.aborted)
      throw new Error('KLIPY tardó demasiado en responder. Inténtalo nuevamente.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
