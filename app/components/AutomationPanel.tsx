"use client";

import { useCallback, useEffect, useState } from "react";

type Job = { key: string; label: string; enabled: boolean; times: string; next_run: string };
type Preview = { id: string; text: string };
type History = {
  alerts: { id: number; type: string; success: boolean; message: string; result: string; created_at: string }[];
  runs: { id: number; job_key: string; status: string; result: string; started_at: string }[];
};
type State = { jobs: Job[]; telegram_configured: boolean };

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/backend/automations${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했습니다.");
  return data as T;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function TelegramAction({ kind, holdingId, label = "텔레그램으로 보내기", onSent }: { kind: string; holdingId?: number; label?: string; onSent?: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  async function prepare() {
    setBusy(true); setMessage(""); setSent(false); setAttempted(false);
    try { setPreview(await request<Preview>("/previews", "POST", { kind, holding_id: holdingId })); }
    catch (error) { setMessage(error instanceof Error ? error.message : "미리보기 실패"); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!preview || attempted) return;
    setBusy(true); setAttempted(true);
    try {
      const result = await request<{ ok: boolean; message: string }>(`/previews/${preview.id}/send`, "POST");
      setMessage(result.message); setSent(result.ok); onSent?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "발송 이력을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  return <div className="telegram-action">
    <button type="button" className="text-button" disabled={busy} onClick={() => void prepare()}>{busy && !preview ? "내용을 준비하고 있어요…" : label}</button>
    {preview && <section className="telegram-preview" aria-label="텔레그램 발송 미리보기">
      <div className="automation-heading"><b>발송 미리보기</b><button type="button" className="text-button" disabled={busy} onClick={() => { setPreview(null); setMessage(""); }}>닫기</button></div>
      <p>설정된 텔레그램 채팅방으로 보냅니다. 미리보기는 30분간 유효합니다.</p><pre>{preview.text}</pre>
      <button type="button" className="primary-button small" disabled={busy || attempted} onClick={() => void send()}>{sent ? "전송 완료" : busy ? "전송 중…" : attempted ? "발송 이력 확인" : "이 내용 보내기"}</button>
    </section>}
    {message && <p className="automation-notice" role="status">{message}</p>}
  </div>;
}

export default function AutomationPanel() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [state, events] = await Promise.all([request<State>(""), request<History>("/history")]);
    setJobs(state.jobs); setConfigured(state.telegram_configured); setHistory(events);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([request<State>(""), request<History>("/history")])
      .then(([state, events]) => { if (active) { setJobs(state.jobs); setConfigured(state.telegram_configured); setHistory(events); } })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  async function save(job: Job, enabled: boolean) {
    setBusy(job.key); setMessage("");
    try { await request(`/${job.key}/settings`, "PUT", { enabled, times: job.times }); await load(); setMessage(`${job.label} 설정을 저장했습니다.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "설정 저장 실패"); }
    finally { setBusy(""); }
  }
  async function refresh() {
    setBusy("refresh");
    try { await load(); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "새로고침 실패"); }
    finally { setBusy(""); }
  }
  const labels: Record<string, string> = { target_price: "목표가 알림", connection_test: "연결 테스트", morning_brief: "아침 브리핑", evening_brief: "저녁 요약", holding_report: "종목 분석", portfolio_analysis: "AI 분석", auto_refresh: "시세 갱신" };
  const statuses: Record<string, string> = { succeeded: "완료", failed: "실패", running: "처리 중 · 중단됐다면 결과 확인 필요", uncertain: "발송 결과 확인 필요", cancelled: "취소" };
  return <section className="automation-panel" aria-label="자동 작업과 텔레그램">
    <div className="automation-heading"><div><span className="eyebrow">자동화</span><h2>필요한 소식만 받아보기</h2></div><button type="button" className="text-button" disabled={!!busy} onClick={() => void refresh()}>새로고침</button></div>
    <p className="automation-description">한국시간 기준입니다. PC와 앱이 실행 중일 때 동작하며, 설정은 재시작 후에도 유지됩니다.</p>
    {!configured && jobs && <p className="automation-notice">텔레그램 연결 설정이 필요합니다. 미리보기는 사용할 수 있습니다.</p>}
    {!jobs && !message && <p>자동 작업 설정을 불러오고 있어요…</p>}
    <div className="automation-jobs">{jobs?.map(job => <article className="automation-job" key={job.key}>
      <div className="automation-heading"><h3>{job.label}</h3><button type="button" role="switch" aria-label={job.label} aria-checked={job.enabled} disabled={!!busy} className={`automation-switch ${job.enabled ? "on" : ""}`} onClick={() => void save(job, !job.enabled)}>{job.enabled ? "켜짐" : "꺼짐"}</button></div>
      {job.key === "price_alerts" ? <p>시세 갱신 시 보유 종목의 목표가 도달을 확인합니다.</p> : <>
        <label className="automation-time">실행 시간<input aria-label={`${job.label} 실행 시간`} value={job.times} placeholder="08:00,21:30" maxLength={150} disabled={!!busy} onChange={event => setJobs(current => current?.map(item => item.key === job.key ? { ...item, times: event.target.value } : item) ?? null)} /></label>
        <div className="automation-heading"><small>{job.next_run ? `다음 ${dateLabel(job.next_run)}` : "예약 꺼짐"}</small><button type="button" className="text-button" disabled={!!busy} onClick={() => void save(job, job.enabled)}>시간 저장</button></div>
      </>}
      {(job.key === "morning_brief" || job.key === "evening_brief") && <TelegramAction kind={job.key} label="미리보기 · 지금 보내기" onSent={() => void refresh()} />}
    </article>)}</div>
    {message && <p className="automation-notice" role="status">{message}</p>}
    <details className="automation-history"><summary>최근 발송 이력 ({history?.alerts.length ?? 0})</summary>
      {history?.alerts.length === 0 && <p>아직 발송 이력이 없습니다.</p>}
      {history?.alerts.map(item => <article key={item.id}><div className="automation-heading"><b>{labels[item.type] || item.type}</b><span>{item.success ? "완료" : "확인 필요"}</span></div><small>{dateLabel(item.created_at)} · {item.result}</small><details><summary>내용 보기</summary><pre>{item.message}</pre></details></article>)}
    </details>
    <details className="automation-history"><summary>자동 작업 실행 기록</summary>
      {history?.runs.length === 0 && <p>아직 실행 기록이 없습니다.</p>}
      {history?.runs.map(item => <article key={item.id}><b>{labels[item.job_key] || item.job_key} · {statuses[item.status] || item.status}</b><small>{dateLabel(item.started_at)}</small><p>{item.result || "완료 기록이 없습니다. 재발송 전에 텔레그램을 확인해 주세요."}</p></article>)}
    </details>
  </section>;
}
