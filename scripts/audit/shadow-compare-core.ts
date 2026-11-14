/** Pure helpers: compare a cloud shadow weekly audit (db-audit.json) with the Mac report of the same PT date.
 * Read-only; uses the same finding key as scripts/audit/weekly.ts so "new" means the same thing on both sides. */
export type Finding = { card_id: string; type: string; severity: 'high' | 'medium' | 'low'; field?: string; detail: string; popular?: boolean };
export const findingKey = (f: Finding) => `${f.type}|${f.card_id}|${f.field || ''}|${f.detail.replace(/\s+/g, ' ').trim()}`;

export interface AuditShadowReport { cloud: number; mac: number; both: number; only_cloud: Finding[]; only_mac: Finding[]; by_severity: Record<string, { both: number; only_cloud: number; only_mac: number }> }

export function compareFindings(cloud: Finding[], mac: Finding[]): AuditShadowReport {
  const a = new Map(cloud.map(f => [findingKey(f), f])), b = new Map(mac.map(f => [findingKey(f), f]));
  const only_cloud = [...a].filter(([k]) => !b.has(k)).map(([, f]) => f);
  const only_mac = [...b].filter(([k]) => !a.has(k)).map(([, f]) => f);
  const by_severity: AuditShadowReport['by_severity'] = {};
  const bump = (sev: string, k: 'both' | 'only_cloud' | 'only_mac') => { (by_severity[sev] ||= { both: 0, only_cloud: 0, only_mac: 0 })[k]++; };
  for (const [k, f] of a) bump(f.severity, b.has(k) ? 'both' : 'only_cloud');
  for (const f of only_mac) bump(f.severity, 'only_mac');
  return { cloud: a.size, mac: b.size, both: a.size - only_cloud.length, only_cloud, only_mac, by_severity };
}

export function renderMarkdown(r: AuditShadowReport, limit = 20): string {
  const lines = [`cloud ${r.cloud} · mac ${r.mac} · both ${r.both} · only cloud ${r.only_cloud.length} · only mac ${r.only_mac.length}`, '', '| severity | both | only cloud | only mac |', '|---|---|---|---|'];
  for (const sev of ['high', 'medium', 'low']) { const s = r.by_severity[sev]; if (s) lines.push(`| ${sev} | ${s.both} | ${s.only_cloud} | ${s.only_mac} |`); }
  const show = (label: string, list: Finding[]) => { for (const f of list.filter(x => x.severity !== 'low').slice(0, limit)) lines.push(`- ${label} [${f.severity}] ${f.type} ${f.card_id}: ${f.detail.slice(0, 110)}`); };
  show('cloud only', r.only_cloud); show('mac only', r.only_mac);
  return lines.join('\n');
}
