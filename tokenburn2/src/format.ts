// TokenBurn 2.0 — display formatting helpers.

/** Money for the headline figures. Small costs get more precision. */
export function money(usd: number): string {
  if (usd === 0) return "$0.00";
  const abs = Math.abs(usd);
  let decimals: number;
  if (abs < 0.01) decimals = 5;
  else if (abs < 1) decimals = 4;
  else decimals = 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(usd);
}

export function tokens(n: number): string {
  return n.toLocaleString("en-US");
}

/** Render a token estimate range like "1,200 (1,020–1,380)". */
export function tokenRange(low: number, high: number, point: number): string {
  if (low === high) return tokens(point);
  return `${tokens(point)} (${tokens(low)}–${tokens(high)})`;
}
