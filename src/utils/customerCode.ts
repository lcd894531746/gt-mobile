import { pinyin } from 'pinyin-pro';

/**
 * 客户代码（简称）：中文取拼音首字母（如「张三」→ ZS），纯英文数字名称取单词首字母或大写去符号压缩。
 */
export function deriveCustomerCodeFromName(name: string): string {
  const s = name.trim();
  if (!s) return '';

  const mostlyAscii = /^[\x00-\x7f]+$/.test(s);
  if (mostlyAscii) {
    const parts = s.split(/[\s\-./,&_|]+/).filter(Boolean);
    if (parts.length >= 2) {
      return parts
        .map((p) => {
          const m = p.match(/[a-zA-Z0-9]/);
          return m ? m[0].toUpperCase() : '';
        })
        .join('')
        .slice(0, 32);
    }
    return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 32);
  }

  const arr = pinyin(s, {
    pattern: 'first',
    type: 'array',
    toneType: 'none',
  }) as string[];

  return arr
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 32);
}
