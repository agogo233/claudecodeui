import type { LLMProvider } from '../types/app';

export type CustomModel = { value: string; label: string };

const STORAGE_KEY = 'custom-models';
const MODEL_VALUE_PATTERN = /^[a-zA-Z0-9_./-]{1,100}$/;

function isValidModelValue(value: string): boolean {
  return MODEL_VALUE_PATTERN.test(value);
}

function readAll(): Record<string, CustomModel[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    console.warn('[customModels] Failed to parse stored custom models');
    return {};
  }
}

function writeAll(data: Record<string, CustomModel[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getCustomModels(provider: LLMProvider): CustomModel[] {
  return readAll()[provider] || [];
}

export function addCustomModel(provider: LLMProvider, value: string, label: string): CustomModel[] {
  if (!isValidModelValue(value)) return readAll()[provider] || [];
  const all = readAll();
  const list = all[provider] || [];
  list.push({ value, label });
  all[provider] = list;
  writeAll(all);
  return list;
}

export function removeCustomModel(provider: LLMProvider, value: string): CustomModel[] {
  const all = readAll();
  all[provider] = (all[provider] || []).filter((m) => m.value !== value);
  writeAll(all);
  return all[provider];
}

export function updateCustomModel(
  provider: LLMProvider,
  oldValue: string,
  newValue: string,
  newLabel: string,
): CustomModel[] {
  if (!isValidModelValue(newValue)) return readAll()[provider] || [];
  const all = readAll();
  const list = all[provider] || [];
  const idx = list.findIndex((m) => m.value === oldValue);
  if (idx !== -1) {
    list[idx] = { value: newValue, label: newLabel };
    all[provider] = list;
    writeAll(all);
  }
  return list;
}
