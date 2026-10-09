// Packs that are baked into the HTML at build time: every samples/pack-*.json.
// On boot, a bundled pack is imported once (identified by its "pack" name); after that it behaves like any
// other pack (deleting it sticks). Bump the "pack" name inside the file (e.g. -v2 -> -v3) to push an update.
const files = import.meta.glob('../samples/pack-*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface BundledPack {
  file: string;
  pack: string;
  text: string;
}

export const BUNDLED: BundledPack[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, text]) => {
    const file = path.split('/').pop()!;
    const m = /"pack"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text.slice(0, 2000));
    return { file, pack: m ? (JSON.parse(`"${m[1]}"`) as string) : file.replace(/\.json$/i, ''), text };
  });
