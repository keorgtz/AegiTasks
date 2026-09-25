import loraUrl from '@fontsource/lora/files/lora-latin-400-normal.woff2?url';
import serifUrl from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?url';
import monoUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import nunitoUrl from '@fontsource/nunito-sans/files/nunito-sans-latin-400-normal.woff2?url';
import plexUrl from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url';

export const noteFonts = [
  { id: 'sans', name: 'Inter · moderna' },
  { id: 'serif', name: 'Georgia · clásica' },
  { id: 'mono', name: 'Mono · sistema' },
  { id: 'lora', name: 'Lora · editorial' },
  { id: 'source-serif', name: 'Source Serif · lectura' },
  { id: 'jetbrains', name: 'JetBrains Mono · código' },
  { id: 'nunito', name: 'Nunito Sans · redondeada' },
  { id: 'plex', name: 'IBM Plex Sans · técnica' },
];
const bundledFonts = [
  ['Lora', loraUrl],
  ['Source Serif 4', serifUrl],
  ['JetBrains Mono', monoUrl],
  ['Nunito Sans', nunitoUrl],
  ['IBM Plex Sans', plexUrl],
];
export const noteFontCss =
  '.font-lora{font-family:Lora,serif}.font-source-serif{font-family:"Source Serif 4",serif}.font-jetbrains{font-family:"JetBrains Mono",monospace}.font-nunito{font-family:"Nunito Sans",sans-serif}.font-plex{font-family:"IBM Plex Sans",sans-serif}';
export async function exportFontCss() {
  return (
    noteFontCss +
    (
      await Promise.all(
        bundledFonts.map(async ([name, url]) => {
          const response = await fetch(url!);
          if (!response.ok) throw new Error('No se pudo preparar la tipografía para exportar.');
          const blob = await response.blob();
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('No se pudo exportar la tipografía.'));
            reader.readAsDataURL(blob);
          });
          return `@font-face{font-family:"${name}";src:url("${data}") format("woff2");font-weight:400;font-style:normal}`;
        }),
      )
    ).join('')
  );
}
