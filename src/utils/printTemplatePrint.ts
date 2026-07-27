import type { PreviewRecord } from '../components/printTemplate/RenderTemplateViews';
import type { TemplateDoc, TemplateImage, TemplateInput, TemplateTable, TemplateTag } from '../types/printTemplate';
import {
  PAPER_MM,
  normalizeTemplateLayout,
  normalizePaperKey,
  paperDimensionsPx,
  resolveComponentBorderSides,
  resolveTemplateInputText,
  resolveTableRowCellDisplay,
} from './printTemplateHelpers';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickTagTheme(color?: string) {
  switch (color) {
    case 'processing':
      return { bg: '#e6f7ff', fg: '#096dd9' };
    case 'success':
      return { bg: '#f6ffed', fg: '#389e0d' };
    case 'error':
      return { bg: '#fff2f0', fg: '#cf1322' };
    case 'warning':
      return { bg: '#fffbe6', fg: '#d48806' };
    default:
      return { bg: '#fafafa', fg: '#595959' };
  }
}

function resolvePrintableInputText(comp: TemplateInput, preview: PreviewRecord) {
  return resolveTemplateInputText(comp, preview);
}

function borderCss(top: number, right: number, bottom: number, left: number) {
  return `border-style:solid;border-color:#111827;border-top-width:${top}px;border-right-width:${right}px;border-bottom-width:${bottom}px;border-left-width:${left}px;`;
}

function renderInputHtml(comp: TemplateInput, preview: PreviewRecord, components: TemplateDoc['components']) {
  const text = escapeHtml(resolvePrintableInputText(comp, preview));
  const border = resolveComponentBorderSides(components, comp);
  const color = escapeHtml(comp.color ?? '#111827');
  const textAlign = escapeHtml(comp.textAlign ?? 'left');
  const fontWeight = escapeHtml(comp.fontWeight ?? '400');
  return `
    <div style="position:absolute;left:${Math.round(comp.x)}px;top:${Math.round(comp.y)}px;width:${Math.round(comp.width)}px;height:${Math.round(comp.height)}px;${borderCss(border.top, border.right, border.bottom, border.left)}box-sizing:border-box;overflow:hidden;background:#fff;padding:0 6px;display:flex;align-items:center;">
      <div style="width:100%;font-size:${Math.max(8, Math.round(comp.fontSize ?? 14))}px;color:${color};text-align:${textAlign};font-weight:${fontWeight};line-height:1.35;">${text}</div>
    </div>
  `;
}

function renderTagHtml(comp: TemplateTag, components: TemplateDoc['components']) {
  const border = resolveComponentBorderSides(components, comp);
  const { bg, fg } = pickTagTheme(comp.color);
  return `
    <div style="position:absolute;left:${Math.round(comp.x)}px;top:${Math.round(comp.y)}px;width:${Math.round(comp.width)}px;height:${Math.round(comp.height)}px;${borderCss(border.top, border.right, border.bottom, border.left)}box-sizing:border-box;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:4px;background:${bg};color:${fg};font-size:${Math.max(8, Math.round((comp.fontSize ?? 13) * 0.95))}px;font-weight:600;">
        ${escapeHtml(comp.title ?? '标签')}
      </div>
    </div>
  `;
}

function renderImageHtml(comp: TemplateImage, components: TemplateDoc['components']) {
  const border = resolveComponentBorderSides(components, comp);
  return `
    <div style="position:absolute;left:${Math.round(comp.x)}px;top:${Math.round(comp.y)}px;width:${Math.round(comp.width)}px;height:${Math.round(comp.height)}px;${borderCss(border.top, border.right, border.bottom, border.left)}box-sizing:border-box;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;">
      ${comp.src ? `<img src="${escapeHtml(comp.src)}" style="width:100%;height:100%;object-fit:contain;" />` : `<span style="font-size:${Math.max(8, Math.round((comp.fontSize ?? 13) * 0.9))}px;color:#94a3b8;">图片</span>`}
    </div>
  `;
}

function renderTableHtml(comp: TemplateTable, preview: PreviewRecord, components: TemplateDoc['components']) {
  const cols = comp.columns ?? [];
  const rowCount = Math.max(1, comp.rows ?? 8);
  const rowHeight = Math.max(20, Math.round(comp.rowHeight ?? 28));
  const fontSize = Math.max(8, Math.round(comp.fontSize ?? 12));
  const previewRows = (preview.items as Record<string, unknown>[]) ?? [];
  const dataRows = (comp.dataSource as Record<string, unknown>[]) ?? [];
  const rows = (previewRows.length > 0 ? previewRows : dataRows).slice(0, rowCount);
  const border = resolveComponentBorderSides(components, comp);

  const headerHtml = cols.map((col) => `
      <div style="flex:${Math.max(1, col.width ?? 120)} 1 0;min-width:40px;padding:4px;border-right:1px solid #cbd5e1;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:${Math.max(8, Math.round(fontSize * 0.92))}px;font-weight:700;color:#334155;text-align:center;">${escapeHtml(col.title)}</span>
      </div>
    `).join('');

  const bodyHtml = Array.from({ length: rowCount }).map((_, rowIndex) => {
    const rowObj = rows[rowIndex] ?? {};
    const cellsHtml = cols.map((col) => `
        <div style="flex:${Math.max(1, col.width ?? 120)} 1 0;min-width:40px;padding:3px 4px;border-right:1px solid #cbd5e1;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:${Math.max(8, Math.round(fontSize * 0.88))}px;color:#1e293b;text-align:center;line-height:1.3;">${escapeHtml(resolveTableRowCellDisplay(rowObj, col.dataIndex))}</span>
        </div>
      `).join('');

    return `<div style="display:flex;min-height:${rowHeight}px;border-bottom:1px solid #cbd5e1;">${cellsHtml}</div>`;
  }).join('');

  return `
    <div style="position:absolute;left:${Math.round(comp.x)}px;top:${Math.round(comp.y)}px;width:${Math.round(comp.width)}px;height:${Math.round(comp.height)}px;${borderCss(border.top, border.right, border.bottom, border.left)}box-sizing:border-box;overflow:hidden;background:#fff;">
      <div style="width:100%;height:100%;display:flex;flex-direction:column;">
        <div style="display:flex;border-bottom:1px solid #cbd5e1;background:#fff;">${headerHtml}</div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

export function buildTemplatePrintHtml(template: TemplateDoc, preview: PreviewRecord) {
  const normalizedTemplate = normalizeTemplateLayout(template);
  const orientation = normalizedTemplate.orientation === 'landscape' ? 'landscape' : 'portrait';
  const paperKey = normalizePaperKey(normalizedTemplate.paperSize);
  const paper = paperDimensionsPx(paperKey, orientation);
  const paperMm = PAPER_MM[paperKey];
  const pageWidth = Math.round(paper.widthPx);
  const pageHeight = Math.round(paper.heightPx);
  const pageWidthMm = orientation === 'landscape' ? paperMm.heightMm : paperMm.widthMm;
  const pageHeightMm = orientation === 'landscape' ? paperMm.widthMm : paperMm.heightMm;

  const componentsHtml = normalizedTemplate.components.map((comp) => {
    switch (comp.type) {
      case 'Input':
        return renderInputHtml(comp as TemplateInput, preview, normalizedTemplate.components);
      case 'Tag':
        return renderTagHtml(comp as TemplateTag, normalizedTemplate.components);
      case 'Image':
        return renderImageHtml(comp as TemplateImage, normalizedTemplate.components);
      case 'Table':
        return renderTableHtml(comp as TemplateTable, preview, normalizedTemplate.components);
      default:
        return '';
    }
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: ${pageWidthMm}mm ${pageHeightMm}mm;
            margin: 0;
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
          }
          body {
            width: ${pageWidth}px;
            min-height: ${pageHeight}px;
          }
          .page {
            position: relative;
            width: ${pageWidth}px;
            height: ${pageHeight}px;
            background: #ffffff;
            overflow: hidden;
          }
          @media print {
            html, body {
              width: ${pageWidth}px;
              height: ${pageHeight}px;
              overflow: hidden;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">${componentsHtml}</div>
      </body>
    </html>
  `;

  return { html, pageWidth, pageHeight };
}

export async function printHtmlInBrowser(html: string, title = '报价打印') {
  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持浏览器打印');
  }

  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!popup) {
    throw new Error('浏览器拦截了打印窗口，请允许弹窗后重试');
  }

  const safeTitle = escapeHtml(title || '报价打印');
  const withTitle = html.includes('<title>')
    ? html.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`)
    : html.replace('</head>', `<title>${safeTitle}</title></head>`);
  const script = `
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 120);
      }, { once: true });
      window.addEventListener('afterprint', function () {
        window.close();
      }, { once: true });
    </script>
  `;
  const printableHtml = withTitle.includes('</body>')
    ? withTitle.replace('</body>', `${script}</body>`)
    : `${withTitle}${script}`;

  popup.document.open();
  popup.document.write(printableHtml);
  popup.document.close();
}

export async function printHtmlInBrowserViaBlob(html: string, title = '鎶ヤ环鎵撳嵃') {
  if (typeof window === 'undefined') {
    throw new Error('褰撳墠鐜涓嶆敮鎸佹祻瑙堝櫒鎵撳嵃');
  }

  const safeTitle = escapeHtml(title || '鎶ヤ环鎵撳嵃');
  const withTitle = html.includes('<title>')
    ? html.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`)
    : html.replace('</head>', `<title>${safeTitle}</title></head>`);
  const script = `
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 120);
      }, { once: true });
      window.addEventListener('afterprint', function () {
        window.close();
      }, { once: true });
    </script>
  `;
  const printableHtml = withTitle.includes('</body>')
    ? withTitle.replace('</body>', `${script}</body>`)
    : `${withTitle}${script}`;

  const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', 'width=1200,height=900');

  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error('娴忚鍣ㄦ嫤鎴簡鎵撳嵃绐楀彛锛岃鍏佽寮圭獥鍚庨噸璇?');
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}
