export type CostBreakdownEntry = {
  key: string;
  label: string;
  value: number;
};

export type NormalizedCostBreakdown = {
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  currency: string | null;
  breakdownEntries: CostBreakdownEntry[];
  provided: {
    input: boolean;
    output: boolean;
    total: boolean;
    currency: boolean;
  };
};

type CostFieldResult = { provided: boolean; value: unknown };

const COST_FIELD_ALIASES = {
  input: ["input_cost", "inputCost", "input cost"],
  output: ["output_cost", "outputCost", "output cost"],
  total: ["total_cost", "totalCost", "total cost"],
  currency: ["currency"],
};

const DEFAULT_CURRENCY = "USD";

export function normalizeCostPayload(payload: unknown): NormalizedCostBreakdown | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const inputField = extractCostField(record, COST_FIELD_ALIASES.input);
  const outputField = extractCostField(record, COST_FIELD_ALIASES.output);
  const totalField = extractCostField(record, COST_FIELD_ALIASES.total);
  const currencyField = extractCostField(record, COST_FIELD_ALIASES.currency);
  const breakdownEntries = extractBreakdownEntries(record);

  const currency =
    typeof currencyField.value === "string" && currencyField.value.trim().length > 0
      ? currencyField.value.trim().slice(0, 16)
      : null;

  return {
    inputCost: parseCostValue(inputField.value),
    outputCost: parseCostValue(outputField.value),
    totalCost: parseCostValue(totalField.value),
    currency,
    breakdownEntries,
    provided: {
      input: inputField.provided,
      output: outputField.provided,
      total: totalField.provided,
      currency: currencyField.provided,
    },
  };
}

export function formatCostAmount(
  value: number | string | null | undefined,
  currency: string | null | undefined,
  fallbackCurrency = DEFAULT_CURRENCY,
): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  const targetCurrency = (currency?.trim().toUpperCase() || fallbackCurrency).slice(0, 16);

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: targetCurrency as Intl.NumberFormatOptions["currency"],
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(numeric);
  } catch (error) {
    console.error("Failed to format cost amount", error);
    return `${targetCurrency} ${numeric.toFixed(2)}`;
  }
}

export function sanitizeCostJson<T>(value: T): T | null {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

function extractCostField(record: Record<string, unknown>, keys: string[]): CostFieldResult {
  for (const key of keys) {
    if (key in record) {
      return { provided: true, value: record[key] };
    }
  }

  return { provided: false, value: undefined };
}

function extractBreakdownEntries(record: Record<string, unknown>): CostBreakdownEntry[] {
  const entries: CostBreakdownEntry[] = [];

  for (const [key, value] of Object.entries(record)) {
    const parsed = parseCostValue(value);
    if (parsed === null) {
      continue;
    }

    entries.push({
      key,
      label: formatBreakdownLabel(key),
      value: parsed,
    });
  }

  return entries;
}

function parseCostValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]+/g, "");
    if (!normalized || normalized.trim().length === 0) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatBreakdownLabel(key: string): string {
  const cleaned = key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return key;
  }

  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}
