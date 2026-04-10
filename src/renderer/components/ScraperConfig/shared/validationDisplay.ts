const URL_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const RELATIVE_URL_PATTERN = /^(?:\/|\.{1,2}\/)/;
const PERCENT_ENCODED_PATTERN = /%[0-9A-Fa-f]{2}/;

const isLikelyUrlValue = (value: string): boolean => {
  const trimmed = value.trim();

  return URL_PROTOCOL_PATTERN.test(trimmed) || RELATIVE_URL_PATTERN.test(trimmed);
};

export const formatDisplayUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || !PERCENT_ENCODED_PATTERN.test(trimmed) || !isLikelyUrlValue(trimmed)) {
    return value;
  }

  try {
    return decodeURI(trimmed);
  } catch {
    return value;
  }
};

export const truncateDisplayValue = (value: string, max = 160): string => (
  value.length > max ? `${value.slice(0, max - 3)}...` : value
);

export const formatValidationDisplayValue = (
  value: string,
  options?: {
    truncate?: number;
    treatAsUrl?: boolean;
  },
): string => {
  const formattedValue = options?.treatAsUrl || isLikelyUrlValue(value)
    ? formatDisplayUrl(value)
    : value;

  return typeof options?.truncate === 'number'
    ? truncateDisplayValue(formattedValue, options.truncate)
    : formattedValue;
};
