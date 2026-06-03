const EXCLUDED_VALUE_PREFIX = "__include_filter_excluded__:";

export type IncludeFilterValueParts = {
  includedValues: string[];
  excludedValues: string[];
};

export const buildIncludeFilterExcludedValue = (value: string): string => (
  `${EXCLUDED_VALUE_PREFIX}${value}`
);

export const getIncludeFilterExcludedId = (value: string): string | null => (
  value.startsWith(EXCLUDED_VALUE_PREFIX)
    ? value.slice(EXCLUDED_VALUE_PREFIX.length)
    : null
);

export const isIncludeFilterExcludedValue = (value: string): boolean => (
  getIncludeFilterExcludedId(value) !== null
);

export const splitIncludeFilterValues = (values: readonly string[]): IncludeFilterValueParts => (
  values.reduce<IncludeFilterValueParts>((result, value) => {
    const excludedId = getIncludeFilterExcludedId(value);
    if (excludedId) {
      result.excludedValues.push(excludedId);
      return result;
    }

    result.includedValues.push(value);
    return result;
  }, {
    includedValues: [],
    excludedValues: [],
  })
);
