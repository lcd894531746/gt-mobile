import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TemplateDoc } from '../types/printTemplate';

const STORAGE_KEY = 'gt_print_templates_v1';

function canUseWebStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeTemplateDocs(raw: unknown): TemplateDoc[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Partial<TemplateDoc>;
      const name = String(row.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        paperSize: row.paperSize ?? 'a4',
        orientation: row.orientation ?? 'portrait',
        components: Array.isArray(row.components) ? row.components : [],
      } as TemplateDoc;
    })
    .filter((item): item is TemplateDoc => item != null);
}

function parseTemplateDocs(raw: string | null): TemplateDoc[] {
  if (!raw) return [];
  try {
    return normalizeTemplateDocs(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function mergeTemplateDocs(primary: TemplateDoc[], secondary: TemplateDoc[]) {
  const merged = new Map<string, TemplateDoc>();
  for (const row of [...secondary, ...primary]) {
    merged.set(row.name, row);
  }
  return Array.from(merged.values());
}

async function readAll(): Promise<TemplateDoc[]> {
  let asyncRows: TemplateDoc[] = [];
  try {
    asyncRows = parseTemplateDocs(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    asyncRows = [];
  }
  const webRows = canUseWebStorage() ? parseTemplateDocs(window.localStorage.getItem(STORAGE_KEY)) : [];
  const merged = mergeTemplateDocs(asyncRows, webRows);

  if (merged.length > 0 && canUseWebStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }

  return merged;
}

async function writeAll(list: TemplateDoc[]) {
  const normalized = normalizeTemplateDocs(list);
  const serialized = JSON.stringify(normalized);
  if (canUseWebStorage()) {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  }
  await AsyncStorage.setItem(STORAGE_KEY, serialized);
}

export async function loadTemplatesFromDevice(): Promise<TemplateDoc[]> {
  return readAll();
}

export async function saveTemplateToDevice(doc: TemplateDoc): Promise<void> {
  const list = await readAll();
  const idx = list.findIndex((t) => t.name === doc.name);
  if (idx >= 0) list[idx] = doc;
  else list.push(doc);
  await writeAll(list);
}

export async function deleteTemplateOnDevice(name: string): Promise<void> {
  const list = (await readAll()).filter((t) => t.name !== name);
  await writeAll(list);
}

export async function renameTemplateOnDevice(oldName: string, doc: TemplateDoc): Promise<void> {
  const list = await readAll();
  const next = list.filter((t) => t.name !== oldName);
  next.push(doc);
  await writeAll(next);
}
