import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TemplateDoc } from '../types/printTemplate';

const STORAGE_KEY = 'gt_print_templates_v1';

async function readAll(): Promise<TemplateDoc[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TemplateDoc[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: TemplateDoc[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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
