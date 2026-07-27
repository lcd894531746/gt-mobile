import { evaluate } from 'mathjs';

function checkParentheses(formula: string): boolean {
  const stack: string[] = [];
  for (const char of formula) {
    if (char === '(') {
      stack.push(char);
    } else if (char === ')') {
      if (stack.length === 0) return false;
      stack.pop();
    }
  }
  return stack.length === 0;
}

function parseSpecification(specification: string, placeholders: string[]): Record<string, number> {
  const values = specification
    .split(/[*xX×]/)
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));

  const parameterMap: Record<string, number> = {};
  placeholders.forEach((placeholder, index) => {
    if (index < values.length) {
      parameterMap[placeholder] = values[index];
    }
  });
  return parameterMap;
}

export function roundTo(number: number, decimals = 2, method = '四舍五入'): number {
  const multiplier = 10 ** decimals;
  switch (method) {
    case '向上取整':
      return Math.ceil(number * multiplier) / multiplier;
    case '向下取整':
      return Math.floor(number * multiplier) / multiplier;
    default:
      return Math.round(number * multiplier) / multiplier;
  }
}

export function calculateWeight(specification: string, formula: string, weightDecimal: number): number[] {
  const formulas = formula.split(/[;；]/).map((item) => item.trim()).filter(Boolean);
  if (formulas.length === 0) return [];

  const placeholders = new Set<string>();
  formulas.forEach((form) => {
    const formPlaceholders = form.match(/[a-zA-Z\u4e00-\u9fa5]+/g) ?? [];
    formPlaceholders.forEach((placeholder) => placeholders.add(placeholder));
  });

  const parameterMap = parseSpecification(specification, Array.from(placeholders));
  const results: number[] = [];

  for (const form of formulas) {
    let weightFormula = form;
    for (const [placeholder, value] of Object.entries(parameterMap)) {
      weightFormula = weightFormula.replace(new RegExp(placeholder, 'g'), String(value));
    }

    weightFormula = weightFormula.replace(/\s+/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')');
    if (!checkParentheses(weightFormula)) {
      results.push(0);
      continue;
    }

    try {
      const result = Number(evaluate(weightFormula));
      results.push(Number.isFinite(result) ? Number.parseFloat(result.toFixed(weightDecimal)) : 0);
    } catch {
      results.push(0);
    }
  }

  return results.length === 1 ? [results[0]] : results;
}
