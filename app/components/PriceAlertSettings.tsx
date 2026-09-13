"use client";

import { useEffect, useState } from "react";

type Rule = { kind: string; label: string; threshold: number; status: string };

export default function PriceAlertSettings({ holdingId, currency }: { holdingId: number; currency: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/backend/automations/holdings/${holdingId}/price-rules`, { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "가격 알림 조회 실패");
      if (active) { setRules(data.rules); setDraft(Object.fromEntries(data.rules.map((r: Rule) => [r.kind, r.threshold ? String(r.threshold) : ""]))); }
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [holdingId]);
  async function save(rearm: boolean) {
    setBusy(true); setMessage("");
    try {
      const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value) || 0]));
      const response = await fetch(`/backend/automations/holdings/${holdingId}/price-rules`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, rearm }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "가격과 변동률을 확인해 주세요.");
      setRules(data.rules); setMessage(rearm ? "다음 조건 도달 시 다시 알립니다." : "가격 알림 조건을 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 실패"); }
    finally { setBusy(false); }
  }
  return <section className="price-alert-settings" aria-label="손절·매수·변동 알림 설정">
    <h3>가격 조건 알림</h3>
    <p>각 조건은 한 번 알립니다. 0 또는 빈칸이면 해당 조건을 끕니다. 시세 갱신 때 확인하며 자동 매매는 실행하지 않습니다.</p>
    <div className="price-rule-grid">{rules.map(rule => <label key={rule.kind}>{rule.label} ({rule.kind === "change_percent" ? "%" : currency})
      <input type="number" min="0" step="any" aria-label={rule.label} value={draft[rule.kind] ?? ""} disabled={busy} placeholder="미설정" onChange={event => setDraft(current => ({ ...current, [rule.kind]: event.target.value }))} />
      <small>{rule.status ? rule.status === "succeeded" ? "발송 완료" : "발송 이력 확인 필요" : "대기"}</small>
    </label>)}</div>
    <div className="automation-heading"><button type="button" className="primary-button small" disabled={busy || !rules.length} onClick={() => void save(false)}>알림 조건 저장</button><button type="button" className="text-button" disabled={busy || !rules.length} onClick={() => void save(true)}>같은 조건으로 다시 알림 받기</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
