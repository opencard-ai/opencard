/** Pure guard + planning logic for apply.ts (no I/O). */
import { changeFingerprint, isOfficialUrl, normalizeExpiry, normalizeField, normalizeNumber, DEFAULT_OFFICIAL_DOMAINS, EXPIRY_ALIASES, EXPIRY_FIELD, type CardRecord, type Confirmation } from './gate';

export interface ApplyOptions { today: string; runAt: number; officialDomains?: string[]; maxConfirmationAgeHours?: number }
export interface FieldChange { field: string; old_value: unknown; new_value: unknown; fingerprint: string }
export interface CardPlan { card_id: string; kinds: string[]; changes: FieldChange[]; sources: string[]; notes: string[] }
export interface HeldItem { card_id: string; field: string | null; value?: unknown; reasons: string[]; fingerprint?: string }
export interface ApplyPlan { today: string; applied: CardPlan[]; held: HeldItem[]; expiry_review: HeldItem[] }

const POINTS_LIKE = new Set(['welcome_offer.bonus_points', 'welcome_offer.cash_bonus', 'welcome_offer.bonus_value', 'welcome_offer.normal_bonus_points', 'welcome_offer.statement_credit', 'welcome_offer.travel_credit']);
const OFFER_STATUSES = new Set(['public', 'public_limited_time', 'public_elevated', 'limited_time_public', 'public_new_card', 'public_with_extra_bonus_path', 'as_high_as_ymmv', 'expired_review_required']);

/** Official, fresh, successful fetches that agree / disagree with the proposed value. */
export function confirmationsFor(confirmations: Confirmation[] | undefined, field: string, value: unknown, opts: ApplyOptions) {
  const domains = opts.officialDomains ?? DEFAULT_OFFICIAL_DOMAINS;
  const maxAge = (opts.maxConfirmationAgeHours ?? 24) * 3600000;
  const usable = (confirmations || []).filter(c => {
    const t = Date.parse(c.checked_at);
    return c.ok && isOfficialUrl(c.url, domains) && Number.isFinite(t) && t <= opts.runAt + 60000 && opts.runAt - t <= maxAge;
  });
  const want = JSON.stringify(normalizeField(field, value));
  const withField = usable.filter(c => field in (c.values || {}) && !(c.ambiguous_fields || []).includes(field));
  const agreeing = withField.filter(c => JSON.stringify(normalizeField(field, c.values[field])) === want);
  const disagreeing = withField.filter(c => JSON.stringify(normalizeField(field, c.values[field])) !== want);
  const ambiguous = usable.filter(c => (c.ambiguous_fields || []).includes(field));
  // Independent = different fetch (fetch_id) — two fetches of one page, or two different official pages.
  const independent = new Set(agreeing.map(c => c.fetch_id)).size;
  return { usable, agreeing, disagreeing, ambiguous, independent, urls: [...new Set(agreeing.map(c => c.url))] };
}

export function sanityCheck(field: string, oldValue: unknown, newValue: unknown, today: string, explicit = false): string[] {
  const reasons: string[] = [];
  if (field === EXPIRY_FIELD) {
    if (newValue === null) reasons.push('clearing_expiry_only_via_expiry_path');
    else if (typeof newValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(newValue) || Number.isNaN(Date.parse(newValue))) reasons.push('invalid_date');
    else if (newValue < today) reasons.push('expiry_in_past');
    return reasons;
  }
  if (field === 'welcome_offer.is_elevated') return typeof newValue === 'boolean' ? [] : ['is_elevated_not_boolean'];
  if (field === 'welcome_offer.offer_status') return OFFER_STATUSES.has(String(newValue)) ? [] : ['unknown_offer_status'];
  if (field === 'annual_fee_description') return typeof newValue === 'string' && newValue.length < 300 ? [] : ['bad_annual_fee_description'];
  const n = normalizeNumber(newValue);
  if (typeof n !== 'number' || !Number.isFinite(n)) return ['not_numeric'];
  if (n < 0) reasons.push('negative');
  if (field === 'annual_fee' && n > 1500) reasons.push('annual_fee_out_of_range');
  if (field === 'welcome_offer.spending_requirement' && (n <= 0 || n > 100000)) reasons.push('spend_out_of_range');
  if (field === 'welcome_offer.time_period_months' && (n < 1 || n > 24 || !Number.isInteger(n))) reasons.push('time_period_out_of_range');
  if (field === 'welcome_offer.bonus_points' && (n <= 0 || n > 1000000)) reasons.push('bonus_out_of_range');
  if (field === 'welcome_offer.cash_bonus' && (n <= 0 || n > 20000)) reasons.push('cash_bonus_out_of_range');
  const old = normalizeNumber(oldValue);
  if (POINTS_LIKE.has(field) && typeof old === 'number' && old > 0 && n > 0 && !explicit && (n > old * 3 || n < old / 3)) reasons.push('bonus_jump_over_3x');
  if (field === 'annual_fee' && typeof old === 'number' && old > 0 && !explicit && (n > old * 2 || n < old / 2)) reasons.push('annual_fee_jump_over_2x');
  return reasons;
}

interface ReportResult { card_id: string; status: string; reasons?: string[]; official_domain?: boolean; changes: Array<{ field: string; old_value: unknown; new_value: unknown; fingerprint: string }>; evidence: { audience?: string; confirmations?: Confirmation[]; explicit_confirmations?: string[]; hold_only?: boolean; hold_reason?: string } }
interface ReportLike { results?: ReportResult[]; expiry?: { expired?: Array<{ card_id: string; priority: string; expiry: string }> } }

export function planApply(report: ReportLike, cards: Map<string, CardRecord>, opts: ApplyOptions, dirtyCards: Set<string> = new Set()): ApplyPlan {
  const applied = new Map<string, CardPlan>();
  const held: HeldItem[] = [];
  const expiryReview: HeldItem[] = [];
  const planFor = (cardId: string) => { if (!applied.has(cardId)) applied.set(cardId, { card_id: cardId, kinds: [], changes: [], sources: [], notes: [] }); return applied.get(cardId)!; };
  const confirmationsByCard = new Map<string, Confirmation[]>();

  for (const result of report.results || []) {
    confirmationsByCard.set(result.card_id, [...(confirmationsByCard.get(result.card_id) || []), ...(result.evidence?.confirmations || [])]);
    if (result.status === 'unchanged') continue;
    if (result.evidence?.hold_only) {
      // Watch entries that can't be parsed reliably (or were auto-added without an extractor): evidence only, never applied.
      const failures = (result.evidence.confirmations || []).filter(c => !c.ok).map(c => `official_fetch_failed: ${c.error ?? 'unknown'}`);
      const reasons = ['hold_only_watch_entry', ...(result.evidence.hold_reason ? [result.evidence.hold_reason] : []), ...new Set(failures)];
      if (result.changes.length) result.changes.forEach(c => held.push({ card_id: result.card_id, field: c.field, value: c.new_value, reasons, fingerprint: c.fingerprint }));
      else held.push({ card_id: result.card_id, field: null, reasons });
      continue;
    }
    if (result.status !== 'review_delta') {
      const reasons = result.status === 'new_product_review' ? ['new_product_requires_human_review'] : (result.reasons?.length ? result.reasons : [result.status]);
      if (result.changes.length) result.changes.forEach(c => held.push({ card_id: result.card_id, field: c.field, value: c.new_value, reasons, fingerprint: c.fingerprint }));
      else held.push({ card_id: result.card_id, field: null, reasons });
      continue;
    }
    for (const change of result.changes) {
      const reasons: string[] = [];
      if (dirtyCards.has(result.card_id)) reasons.push('card_file_has_uncommitted_changes');
      if (result.official_domain !== true) reasons.push('primary_source_not_official_domain');
      const conf = confirmationsFor(result.evidence?.confirmations, change.field, change.new_value, opts);
      if (conf.disagreeing.length) reasons.push('official_fetches_disagree');
      if (conf.ambiguous.length) reasons.push('ambiguous_value_on_official_page');
      if (conf.independent < 2) reasons.push('needs_two_independent_official_fetches');
      const explicit = (result.evidence?.explicit_confirmations || []).includes(change.field);
      reasons.push(...sanityCheck(change.field, change.old_value, change.new_value, opts.today, explicit));
      if (reasons.length) { held.push({ card_id: result.card_id, field: change.field, value: change.new_value, reasons, fingerprint: change.fingerprint }); continue; }
      const plan = planFor(result.card_id);
      if (!plan.kinds.includes('offer_update')) plan.kinds.push('offer_update');
      plan.changes.push({ field: change.field, old_value: change.old_value, new_value: change.new_value, fingerprint: change.fingerprint });
      conf.urls.forEach(u => { if (!plan.sources.includes(u)) plan.sources.push(u); });
    }
  }

  // Expired elevated / limited-time offers: revert only when an official page was fetched and no longer shows the old bonus.
  for (const item of report.expiry?.expired || []) {
    if (item.priority !== 'high') continue;
    const card = cards.get(item.card_id);
    if (!card) continue;
    const offer = card.welcome_offer || {};
    const confs = confirmationsByCard.get(item.card_id) || [];
    const domains = opts.officialDomains ?? DEFAULT_OFFICIAL_DOMAINS;
    const fetched = confs.filter(c => c.ok && isOfficialUrl(c.url, domains) && opts.runAt - Date.parse(c.checked_at) <= (opts.maxConfirmationAgeHours ?? 24) * 3600000);
    if (dirtyCards.has(item.card_id)) { expiryReview.push({ card_id: item.card_id, field: EXPIRY_FIELD, reasons: ['card_file_has_uncommitted_changes'] }); continue; }
    if (!confs.length) { expiryReview.push({ card_id: item.card_id, field: EXPIRY_FIELD, reasons: ['expired_not_in_watchlist_no_official_fetch'] }); continue; }
    if (!fetched.length) { expiryReview.push({ card_id: item.card_id, field: EXPIRY_FIELD, reasons: ['official_page_fetch_failed'] }); continue; }
    if (report.results?.some(r => r.card_id === item.card_id && r.evidence?.hold_only)) { expiryReview.push({ card_id: item.card_id, field: EXPIRY_FIELD, reasons: ['hold_only_watch_entry'] }); continue; }
    // Only pages whose extractor actually read an offer count; "fetched but nothing parsed" is never treated as "offer gone".
    const parsed = fetched.filter(c => ['welcome_offer.bonus_points', 'welcome_offer.cash_bonus'].some(f => f in (c.values || {})));
    const oldBonus = normalizeNumber(offer.bonus_points);
    if (!parsed.length) {
      expiryReview.push({ card_id: item.card_id, field: EXPIRY_FIELD, reasons: [fetched.some(c => c.observed?.current_bonus_visible) ? 'expired_offer_still_shown_on_official_page' : 'official_page_offer_not_parsed'] }); continue;
    }
    if (parsed.some(c => normalizeNumber(c.values?.['welcome_offer.bonus_points']) === oldBonus || (normalizeNumber(offer.cash_bonus) !== null && normalizeNumber(c.values?.['welcome_offer.cash_bonus']) === normalizeNumber(offer.cash_bonus)))) {
      expiryReview.push({ card_id: item.card_id, field: EXPIRY_FIELD, reasons: ['expired_offer_still_shown_on_official_page'] }); continue;
    }
    const plan = planFor(item.card_id);
    plan.kinds.push('expiry_revert');
    const hasConfirmedBonus = plan.changes.some(c => c.field === 'welcome_offer.bonus_points' || c.field === 'welcome_offer.cash_bonus');
    const add = (field: string, oldValue: unknown, newValue: unknown) => {
      if (JSON.stringify(oldValue) === JSON.stringify(newValue) || plan.changes.some(c => c.field === field)) return;
      plan.changes.push({ field, old_value: oldValue, new_value: newValue, fingerprint: changeFingerprint(item.card_id, field, newValue, 'public') });
    };
    if (offer.is_elevated === true) add('welcome_offer.is_elevated', true, false);
    if (hasConfirmedBonus) {
      add(EXPIRY_FIELD, normalizeExpiry(offer).value, null);
      add('welcome_offer.offer_status', offer.offer_status ?? null, 'public');
      plan.notes.push(`Elevated offer expired ${item.expiry}; official page shows a different current offer, applied as public/standard.`);
    } else {
      add('welcome_offer.offer_status', offer.offer_status ?? null, 'expired_review_required');
      plan.notes.push(`Elevated offer expired ${item.expiry} and is no longer shown officially; no confirmed replacement value, marked expired_review_required.`);
      expiryReview.push({ card_id: item.card_id, field: 'welcome_offer.bonus_points', reasons: ['expired_no_confirmed_replacement_offer'] });
    }
    parsed.forEach(c => { if (!plan.sources.includes(c.url)) plan.sources.push(c.url); });
  }
  return { today: opts.today, applied: [...applied.values()].filter(p => p.changes.length), held, expiry_review: expiryReview };
}

const fmt = (n: unknown) => Number(n).toLocaleString('en-US');
const usDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}/${y}`; };
function describe(offer: Record<string, any>): string {
  const spend = offer.spending_requirement, months = offer.time_period_months;
  const tail = spend ? ` after spending $${fmt(spend)} on purchases in the first ${months} months` : '';
  const unit = /skymiles|aadvantage|miles|aeroplan|mileageplus|trueblue|mileage/i.test(String(offer.point_program || '')) ? 'bonus miles' : 'bonus points';
  let text = offer.cash_bonus && !offer.bonus_points ? `Earn a $${fmt(offer.cash_bonus)} cash bonus${tail}` : `Earn ${fmt(offer.bonus_points)} ${offer.point_program || ''} ${unit}`.replace(/\s+/g, ' ') + tail;
  if (offer.statement_credit) text += `, plus a $${fmt(offer.statement_credit)} statement credit`;
  if (offer.travel_credit) text += `, plus a $${fmt(offer.travel_credit)} travel credit`;
  if (offer.free_nights) text += `, plus ${offer.free_nights} Free Night Award${offer.free_nights > 1 ? 's' : ''}`;
  text += '.';
  const exp = normalizeExpiry(offer).value;
  if (/limited/i.test(String(offer.offer_status || '')) && exp) text = `Limited-time offer: ${text} Offer ends ${usDate(exp)}.`;
  return text;
}
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Pure: apply a CardPlan to a card record following repo conventions. */
export function applyPlanToCard(card: CardRecord, plan: CardPlan, today: string): CardRecord {
  const next = JSON.parse(JSON.stringify(card));
  next.welcome_offer ||= {};
  const offer = next.welcome_offer;
  const oldBonus = normalizeNumber(offer.bonus_points), oldCash = normalizeNumber(offer.cash_bonus);
  for (const change of plan.changes) {
    if (change.field === EXPIRY_FIELD) {
      const present = EXPIRY_ALIASES.filter(a => a in offer);
      if (change.new_value === null) EXPIRY_ALIASES.forEach(a => { delete offer[a]; });
      else (present.length ? present : ['expires']).forEach(a => { offer[a] = change.new_value; });
    } else if (change.field.startsWith('welcome_offer.')) offer[change.field.slice('welcome_offer.'.length)] = change.new_value;
    else next[change.field] = change.new_value;
  }
  const newBonus = normalizeNumber(offer.bonus_points), newCash = normalizeNumber(offer.cash_bonus);
  if (typeof oldBonus === 'number' && oldBonus > 0 && typeof newBonus === 'number' && newBonus !== oldBonus && typeof offer.estimated_value === 'number') offer.estimated_value = Math.round(offer.estimated_value * newBonus / oldBonus);
  if (typeof newCash === 'number' && newCash !== oldCash) offer.estimated_value = newCash + (Number(offer.travel_credit) || 0) + (Number(offer.statement_credit) || 0);
  if (offer.is_elevated === false && offer.normal_bonus_points !== undefined && offer.normal_bonus_points === offer.bonus_points) delete offer.normal_bonus_points;
  const offerFields = ['welcome_offer.bonus_points', 'welcome_offer.cash_bonus', 'welcome_offer.spending_requirement', 'welcome_offer.time_period_months', 'welcome_offer.statement_credit', 'welcome_offer.travel_credit', 'welcome_offer.free_nights', 'welcome_offer.offer_status', EXPIRY_FIELD];
  if (plan.changes.some(c => offerFields.includes(c.field))) offer.description = describe(offer);
  const summary = plan.changes.map(c => `${c.field.replace('welcome_offer.', '')} ${JSON.stringify(c.old_value)} -> ${JSON.stringify(c.new_value)}`).join('; ');
  const notes = Array.isArray(offer.notes) ? offer.notes : offer.notes ? [String(offer.notes)] : [];
  notes.push(`${today} offer-watch auto-apply (two independent official fetches): ${summary}. Sources: ${plan.sources.join(', ')}.`, ...plan.notes);
  offer.notes = notes;
  offer.last_verified = today;
  next.sources = Array.isArray(next.sources) ? next.sources : [];
  for (const url of [...plan.sources].reverse()) if (!next.sources.some((s: any) => s?.url === url)) next.sources.unshift({ url, notes: `Official page confirmed by offer-watch on ${today}.` });
  next.last_updated = `${today}T12:00:00.000Z`;
  next.last_verified = today;
  next.next_review = `${addDays(today, 30)}T00:00:00.000Z`;
  return next;
}

/** Light schema check (full validator runs afterwards). */
export function schemaCheck(card: CardRecord): string[] {
  const errors: string[] = [];
  if (typeof card.card_id !== 'string' || !card.card_id) errors.push('card_id');
  if (typeof card.name !== 'string' || !card.name) errors.push('name');
  if (typeof card.annual_fee !== 'number' || card.annual_fee < 0) errors.push('annual_fee');
  const offer = card.welcome_offer || {};
  for (const key of ['bonus_points', 'cash_bonus', 'spending_requirement', 'time_period_months', 'estimated_value', 'statement_credit', 'travel_credit', 'free_nights', 'normal_bonus_points'])
    if (offer[key] !== undefined && offer[key] !== null && (typeof offer[key] !== 'number' || !Number.isFinite(offer[key]))) errors.push(`welcome_offer.${key}`);
  if (offer.is_elevated !== undefined && typeof offer.is_elevated !== 'boolean') errors.push('welcome_offer.is_elevated');
  for (const alias of EXPIRY_ALIASES) if (offer[alias] !== undefined && offer[alias] !== null && !/^\d{4}-\d{2}-\d{2}/.test(String(offer[alias]))) errors.push(`welcome_offer.${alias}`);
  return errors;
}
