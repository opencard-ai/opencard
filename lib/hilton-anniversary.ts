const PRODUCTS = new Set(['amex-hilton-honors', 'amex-hilton-surpass', 'amex-hilton-honors-aspire']);
export type OpeningMonth = { month?: number; year?: number };
export type HiltonHint = { stage: 'before' | 'anniversary'; key: string };

/** A review window, not bank eligibility: month before / month of first or later anniversary. */
export function hiltonAnniversaryHint(product: string, opened?: OpeningMonth, now = new Date()): HiltonHint | null {
  if (!PRODUCTS.has(product) || !opened || !Number.isInteger(opened.month) || !Number.isInteger(opened.year)) return null;
  const month = opened.month!;
  const year = opened.year!;
  if (month < 1 || month > 12 || year < 1900) return null;
  const elapsed = (now.getUTCFullYear() - year) * 12 + now.getUTCMonth() + 1 - month;
  if (elapsed < 11) return null;
  const phase = elapsed % 12;
  if (phase !== 11 && phase !== 0) return null;
  const stage = phase === 11 ? 'before' : 'anniversary';
  const anniversaryYear = year + Math.ceil(elapsed / 12);
  return { stage, key: `${year}-${month}:${anniversaryYear}:${stage}` };
}

const COPY = {
  en: { before: 'Your card anniversary is approaching. Review Hilton upgrade or downgrade options.', anniversary: 'This is your card anniversary month. Review Hilton upgrade or downgrade options.', ask: 'Ask AI', email: 'Visit My Cards to ask AI', title: 'Hilton anniversary check', prompt: (name: string, date: string) => `My ${name} has an opening date of ${date}. Is it worth considering an upgrade or downgrade? Ask me about any previous product changes, actual offers, annual fee and free-night status before suggesting a change.` },
  zh: { before: '接近開卡週年，可檢查 Hilton 升降級選項。', anniversary: '本月是開卡週年月，可檢查 Hilton 升降級選項。', ask: '問 AI', email: '到 My Cards 問 AI', title: 'Hilton 週年提示', prompt: (name: string, date: string) => `我這張 ${name} 的開卡時間是 ${date}，現在值得考慮升級或降級嗎？請先確認是否曾升降級、實際 offer、年費及房晚狀態再建議。` },
  'zh-cn': { before: '接近开卡周年，可检查 Hilton 升降级选项。', anniversary: '本月是开卡周年月，可检查 Hilton 升降级选项。', ask: '问 AI', email: '到 My Cards 问 AI', title: 'Hilton 周年提示', prompt: (name: string, date: string) => `我这张 ${name} 的开卡时间是 ${date}，现在值得考虑升级或降级吗？请先确认是否曾升降级、实际 offer、年费及房晚状态再建议。` },
  es: { before: 'Se acerca el aniversario de tu tarjeta. Revisa las opciones de cambio de categoría Hilton.', anniversary: 'Este es el mes de aniversario de tu tarjeta. Revisa las opciones de cambio de categoría Hilton.', ask: 'Preguntar a la IA', email: 'Ir a Mis Tarjetas para preguntar a la IA', title: 'Aniversario Hilton', prompt: (name: string, date: string) => `Mi ${name} tiene fecha de apertura ${date}. ¿Conviene cambiar de categoría? Antes de recomendar un cambio, pregunta por cambios anteriores, ofertas reales, cuota anual y noches gratis.` },
};
export function hiltonCopy(lang: string) { return COPY[lang as keyof typeof COPY] || COPY.en; }
export function openingMonthText(date: OpeningMonth) { return `${date.year}-${String(date.month).padStart(2, '0')}`; }

export function reminderInstances(user: Record<string, unknown>): { instance_id: string; card_id: string }[] {
  let raw = user.card_instances;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return []; } }
  if (Array.isArray(raw)) return raw.filter(x => x && x.status !== 'closed' && typeof x.instance_id === 'string' && typeof x.card_id === 'string');
  return Array.isArray(user.cards) ? user.cards.filter((x): x is string => typeof x === 'string').map(id => ({ instance_id: id, card_id: id })) : [];
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export type HiltonEmailHint = { key: string; name: string; date: string; hint: HiltonHint };
export function hiltonEmailSection(hints: HiltonEmailHint[], lang: string, base: string) {
  if (!hints.length) return '';
  const t = hiltonCopy(lang);
  const locale = ['en','zh','zh-cn','es'].includes(lang) ? lang : 'en';
  return `<section><h3>${escape(t.title)}</h3>${hints.map(x => `<p><strong>${escape(x.name)}</strong> (${escape(x.date)})<br>${escape(t[x.hint.stage])}</p>`).join('')}<p><a href="${escape(base)}/${locale}/my-cards#my-cards-ai">${escape(t.email)}</a></p></section>`;
}
