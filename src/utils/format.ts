export function formatPrice(price: number): string {
  return new Intl.NumberFormat("ko-KR").format(price) + "원";
}

export function formatPriceTable(
  items: { name: string; price: number; source: string; url: string }[]
): string {
  if (items.length === 0) return "검색 결과가 없습니다.";

  const lines = items.map(
    (item, i) =>
      `${i + 1}. ${item.name}\n   💰 ${formatPrice(item.price)} (${item.source})\n   🔗 ${item.url}`
  );

  return lines.join("\n\n");
}

export function formatBuildEstimate(
  parts: { category: string; name: string; price: number }[],
  total: number,
  budget: number
): string {
  const lines = parts.map(
    (p) => `• ${p.category}: ${p.name} - ${formatPrice(p.price)}`
  );

  lines.push("");
  lines.push(`총 금액: ${formatPrice(total)}`);
  lines.push(`예산: ${formatPrice(budget)}`);
  lines.push(`잔액: ${formatPrice(budget - total)}`);

  return lines.join("\n");
}
