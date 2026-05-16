/**
 * 直接使用 china-division 的 JSON 数据；勿 import 包入口 `china-division`，
 * 其在 lib/export.js 里 require('path')，Metro/React Native 无法解析。
 */
import pcaJson from 'china-division/dist/pca.json';

/** 「省份 → 城市 → 区县」三级名称（与 china-division/pca.json 一致） */
export type PcaTree = Record<string, Record<string, string[]>>;

const PCA = pcaJson as PcaTree;

export function getProvinceNames(): string[] {
  return Object.keys(PCA).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

export function getCityNames(province: string): string[] {
  const cities = PCA[province];
  if (!cities) return [];
  return Object.keys(cities).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

export function getDistrictNames(province: string, city: string): string[] {
  const list = PCA[province]?.[city];
  return list ? [...list] : [];
}
