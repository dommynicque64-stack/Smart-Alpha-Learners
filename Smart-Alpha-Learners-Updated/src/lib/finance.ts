export function formatKES(n?: number | string | null) {
  const v = Number(n || 0);
  return 'KES ' + v.toLocaleString('en-KE', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function printHTML(title: string, body: string) {
  const w = window.open('', '_blank', 'width=960,height=720');
  if (!w) return;
  w.document.write(
    '<!doctype html><html><head><title>' + title + '</title><style>' +
    '*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;padding:32px}' +
    '.doc{max-width:780px;margin:0 auto}.head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #065f46;padding-bottom:16px;margin-bottom:16px}' +
    '.head img{height:64px;width:64px;object-fit:contain}.muted{color:#64748b;font-size:12px}' +
    'table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}' +
    'th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}th{background:#f1f5f9}' +
    '.right{text-align:right}.total{font-weight:bold;font-size:16px}' +
    '.foot{margin-top:28px;display:flex;justify-content:space-between;font-size:12px;color:#475569}' +
    '.stamp{border:2px solid #065f46;color:#065f46;padding:4px 14px;font-weight:bold;border-radius:8px;display:inline-block;letter-spacing:1px}' +
    '.meta{display:flex;justify-content:space-between;gap:16px;margin:12px 0;font-size:13px}' +
    '@media print{body{padding:0}.noprint{display:none}}' +
    '</style></head><body><div class="doc">' + body +
    '</div><scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},300)};</scr' + 'ipt></body></html>'
  );
  w.document.close();
}

export function schoolHeadHTML(school: any, docTitle: string, docNo: string) {
  const contact = [school?.address, school?.county, school?.phone, school?.email].filter(Boolean).join(' &middot; ');
  return (
    '<div class="head">' + (school?.logo_url ? '<img src="' + school.logo_url + '" />' : '') + '<div>' +
    '<div style="font-size:22px;font-weight:bold;">' + (school?.name || 'Smart Alpha Learners') + '</div>' +
    '<div class="muted">' + contact + '</div>' +
    '<div style="margin-top:8px;font-size:16px;font-weight:bold;">' + docTitle + ' <span class="muted">#' + docNo + '</span></div>' +
    '</div></div>'
  );
}

export function learnerMetaHTML(learner: any, extra: [string, string][]) {
  const name = learner ? [learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ') : '—';
  const left = '<div><strong>' + name + '</strong><br/><span class="muted">Adm: ' + (learner?.admission_no || '—') + '</span></div>';
  const right = extra.map(([k, v]) => '<div><span class="muted">' + k + ':</span> <strong>' + v + '</strong></div>').join('');
  return '<div class="meta"><div>' + left + '</div><div style="text-align:right">' + right + '</div></div>';
}
