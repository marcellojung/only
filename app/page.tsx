"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type TabId =
  | "summary"
  | "family"
  | "stocks"
  | "ledger"
  | "crypto"
  | "realestate"
  | "calendar"
  | "settings";

type Transaction = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  kind: "expense" | "income";
  owner: "성근" | "지우" | "윤재" | "공통";
};

type Portfolio = {
  source: string;
  asOf: string;
  owner: "성근" | "지우" | "윤재" | "공통";
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  cash: number;
  investments: number;
  realEstate: number;
  movable: number;
  other: number;
};

type ImportStatus = {
  label: string;
  importedAt: string;
  transactionCount: number;
  holdingCount: number;
};

type HoldingData = {
  id: number;
  owner: string;
  asset_type: string;
  broker: string;
  name: string;
  ticker: string;
  ticker_source: string;
  currency: string;
  principal: number;
  market_value: number;
  return_rate: number;
  quantity: number | null;
  quantity_source: string;
  current_price: number | null;
  price_source: string;
  price_updated_at: string;
  target_price: number;
  target_alert_enabled: boolean;
  target_alert_sent_at: string;
};

type AssetSummary = {
  total_assets: number;
  total_debts: number;
  net_assets: number;
  investment_value: number;
  investment_principal: number;
  investment_profit_loss: number;
  investment_return_rate: number;
  real_estate_value: number;
  cash_value: number;
  monthly_spending: number;
  spending_month: string;
};

type IntegrationStatus = Record<string, {
  configured: boolean;
  connected: boolean;
  message: string;
  detail?: string;
  last_checked_at?: string;
}>;

type GowalterPrompt = {
  prompt: string;
  archive_ready: boolean;
  source_label: string;
  archive_dir: string;
  lens_summary: string;
  related_posts: Array<{ title: string; url: string; published_at: string; summary: string }>;
};

type StockReport = {
  holding_id: number;
  name: string;
  ticker: string;
  generated_at: string;
  broker_research: Array<{ provider: string; title: string; description: string; url: string; kind: string }>;
  news: { configured: boolean; provider: string; message: string; items: Array<{ title: string; summary: string; url: string; published_at: string }> };
  prompts: Array<{ id: string; title: string; description: string; text: string }>;
  dart: {
    configured: boolean;
    available: boolean;
    message: string;
    basis: string;
    metrics: Array<{ key: string; label: string; current: number; previous: number | null; change_rate: number | null }>;
    ratios: Array<{ label: string; value: number }>;
    analysis: { summary: string; observations: string[]; cautions: string[] } | null;
    disclosures: Array<{ title: string; date: string; submitter: string; url: string }>;
  };
};

type ServerState = {
  protected: boolean;
  viewer: { owner:"성근"|"지우"|"윤재"; role:"admin"|"guest" };
  updated_at: string;
  summary: AssetSummary;
  members: Record<string, number>;
  transactions: Array<{
    id: string;
    date: string;
    type: string;
    merchant: string;
    category: string;
    amount: number;
    owner: "성근" | "지우" | "윤재" | "공통";
  }>;
  holdings: HoldingData[];
  debts: DebtData[];
  events: CalendarEvent[];
  history: Array<{ id: number; source: string; total_assets: number; total_debts: number; net_assets: number; investment_value: number; captured_at: string }>;
  exchange_rate: { pair: string; rate: number; source: string; updated_at: string };
  latest_analysis: { id: number; text: string; provider: string; model: string; created_at: string } | null;
  integrations: IntegrationStatus;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  owner: "공통" | "성근" | "지우" | "윤재";
  color?: string;
  googleEventId?: string;
};

type CalendarConnectionStatus = {
  configured:boolean;
  connected:boolean;
  message:string;
  calendarName?:string;
  calendarId?:string;
};

type VersionInfo = { version:string; revision:string; started_at:string };

async function requestVersionInfo() {
  const response = await fetch("/api/version",{headers:{"x-app-key":sessionStorage.getItem("family-key")||""},cache:"no-store"});
  if(!response.ok)throw new Error("version unavailable");
  return await response.json() as VersionInfo;
}

type HoldingCreatePayload = {
  owner: string;
  asset_type: "주식" | "ETF" | "펀드" | "코인";
  broker: string;
  name: string;
  ticker: string;
  quantity: number;
  principal: number;
};

type DebtData = {
  id:number;
  owner:string;
  debt_type:string;
  provider:string;
  name:string;
  principal:number;
  balance:number;
  interest_rate:number;
  opened_on:string;
  matures_on:string;
  manual:boolean;
};

type DebtCreatePayload = {
  owner:string;
  debt_type:string;
  provider:string;
  name:string;
  principal:number;
  balance:number;
  interest_rate:number;
};

const navItems: { id: TabId; label: string }[] = [
  { id: "summary", label: "요약" },
  { id: "family", label: "가족별" },
  { id: "stocks", label: "주식/ETF" },
  { id: "ledger", label: "가계부" },
  { id: "crypto", label: "암호화폐" },
  { id: "realestate", label: "부동산" },
  { id: "calendar", label: "일정" },
  { id: "settings", label: "설정" },
];

const initialTransactions: Transaction[] = [
  { id: "1", date: "2026-08-03", merchant: "마켓컬리", category: "식비", amount: 68400, kind: "expense", owner: "지우" },
  { id: "2", date: "2026-08-02", merchant: "현대오일뱅크", category: "교통", amount: 76000, kind: "expense", owner: "성근" },
  { id: "3", date: "2026-08-01", merchant: "넷플릭스", category: "구독", amount: 17000, kind: "expense", owner: "성근" },
  { id: "4", date: "2026-07-31", merchant: "교보문고", category: "생활", amount: 28900, kind: "expense", owner: "윤재" },
];

const initialPortfolio: Portfolio = {
  source: "demo",
  asOf: "",
  owner: "공통",
  totalAssets: 0,
  totalDebts: 0,
  netWorth: 0,
  cash: 0,
  investments: 0,
  realEstate: 0,
  movable: 0,
  other: 0,
};

const money = (value: number) => new Intl.NumberFormat("ko-KR").format(value);
const compactMoney = (value: number) => {
  if (value >= 100000000) {
    const eok = Math.floor(value / 100000000);
    const man = Math.floor((value % 100000000) / 10000);
    return `${eok}억 ${man ? `${money(man)}만` : ""}원`;
  }
  return `${money(Math.round(value / 10000))}만원`;
};

const percentage = (value: number, total: number) => total ? value / total * 100 : 0;
const isCryptoHolding = (item: HoldingData) => ["코인", "암호화폐", "crypto"].includes(item.asset_type.toLowerCase());
const assetKey = (item: HoldingData) => `holding:${item.id}`;

function Icon({ name }: { name: string }) {
  const paths:Record<string,ReactNode> = {
    home:<><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></>,
    chart:<><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m15 6 3-3 3 3"/></>,
    wallet:<><path d="M3 6.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13"/><path d="M16 11h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    eye:<><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff:<><path d="m3 3 18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.5 7.3A15.4 15.4 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.2-.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
  };
  return <svg className="app-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? <circle cx="12" cy="12" r="2" fill="currentColor"/>}</svg>;
}

function Amount({ children, hidden }: { children: ReactNode; hidden: boolean }) {
  return <>{hidden ? <span className="private-value" aria-label="숨긴 금액">••••••</span> : children}</>;
}

function ScreenHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="screen-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
  );
}

function Summary({ hidden, hiddenRealEstate, readOnly, setTab, portfolio, transactions, onImport, importStatus, importing }: { hidden: boolean; hiddenRealEstate: boolean; readOnly:boolean; setTab: (tab: TabId) => void; portfolio: Portfolio; transactions: Transaction[]; onImport: (files: FileList | null, owner?: string) => void; importStatus: ImportStatus | null; importing: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importOwner,setImportOwner] = useState("성근");
  const expenses = transactions.filter((item) => item.kind === "expense");
  const latestMonth = expenses.map((item) => item.date.slice(0, 7)).sort().at(-1) || portfolio.asOf.slice(0, 7);
  const monthExpense = expenses.filter((item) => item.date.startsWith(latestMonth)).reduce((sum, item) => sum + item.amount, 0);
  const monthlyExpenses = [...expenses.reduce((months, item) => {
    const month = item.date.slice(0, 7);
    months.set(month, (months.get(month) || 0) + item.amount);
    return months;
  }, new Map<string, number>()).entries()].sort().slice(-6);
  const maxExpense = Math.max(...monthlyExpenses.map(([, value]) => value), 1);
  const allocations = [
    { label: "부동산", value: portfolio.realEstate, className: "real" },
    { label: "투자", value: portfolio.investments, className: "stock" },
    { label: "현금", value: portfolio.cash, className: "cash" },
    { label: "기타", value: portfolio.movable + portfolio.other, className: "crypto" },
  ];
  return (
    <section className="screen fade-in" aria-label="자산 요약">
      {!readOnly&&<div className="upload-row bank-upload"><select className="owner-select" aria-label="업로드 소유자" value={importOwner} onChange={(event)=>setImportOwner(event.target.value)}><option>성근</option><option>지우</option><option>윤재</option><option>공통</option></select><button className="primary-button" disabled={importing} onClick={()=>inputRef.current?.click()}>{importing ? "파일 반영 중…" : "＋ 뱅크샐러드 통합 파일 불러오기"}</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xlsm" onChange={(event)=>{ onImport(event.target.files,importOwner); event.target.value = ""; }} /><span>같은 내역은 제외하고 자산 이력은 누적해요</span></div>}
      {readOnly&&<div className="guest-notice">게스트 모드 · 내 자산만 조회할 수 있어요.</div>}
      {importStatus && <div className="import-status" role="status"><b>✓ 업데이트 완료</b><span>{importStatus.label} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(importStatus.importedAt))}</span><small>가계부 {money(importStatus.transactionCount)}건 · 투자상품 {money(importStatus.holdingCount)}개</small></div>}
      <div className="hero-card">
        <div className="hero-orb" />
        <span className="eyebrow light">우리 집 순자산</span>
        <h1><Amount hidden={hidden}>{compactMoney(portfolio.netWorth)}</Amount></h1>
        <div className="change-pill">✓ {portfolio.source || "직접 입력"} · {portfolio.asOf || "업데이트 전"}</div>
        <div className="hero-divider" />
        <div className="hero-stats">
          <div><span>총 자산</span><strong><Amount hidden={hidden}>{compactMoney(portfolio.totalAssets)}</Amount></strong></div>
          <div><span>총 부채</span><strong><Amount hidden={hidden}>{compactMoney(portfolio.totalDebts)}</Amount></strong></div>
        </div>
      </div>

      <div className="section-title-row">
        <div><span className="eyebrow">한눈에 보기</span><h2>자산 흐름</h2></div>
        {!readOnly&&<button className="text-button" onClick={() => setTab("family")}>가족별 보기 →</button>}
      </div>

      <div className="metric-grid">
        <article className="metric-card peach"><span className="metric-icon">↗</span><p>투자 자산</p><strong><Amount hidden={hidden}>{compactMoney(portfolio.investments)}</Amount></strong><small>주식 · ETF · 펀드</small></article>
        <article className="metric-card blue"><span className="metric-icon">⌂</span><p>부동산</p><strong><Amount hidden={hidden || hiddenRealEstate}>{compactMoney(portfolio.realEstate)}</Amount></strong><small>{hiddenRealEstate ? "개별 자산 숨김 적용 중" : "뱅크샐러드 평가금액"}</small></article>
        <article className="metric-card mint"><span className="metric-icon">₩</span><p>{latestMonth ? `${Number(latestMonth.slice(5))}월 지출` : "이번 달 지출"}</p><strong><Amount hidden={hidden}>{compactMoney(monthExpense)}</Amount></strong><small>이체 제외 · 실제 지출</small></article>
        <article className="metric-card lilac"><span className="metric-icon">◎</span><p>현금성 자산</p><strong><Amount hidden={hidden}>{compactMoney(portfolio.cash)}</Amount></strong><small>입출금 · 저축 · 전자금융</small></article>
      </div>

      <article className="panel trend-panel">
        <div className="panel-head">
          <div><span className="eyebrow">최근 6개월</span><h2>월별 지출</h2></div>
          <span className="positive">이체 제외</span>
        </div>
        <div className="line-chart" aria-label="최근 6개월 월별 지출 차트">
          {monthlyExpenses.map(([month, value]) => (
            <i key={month} title={`${month} ${money(value)}원`} style={{ height: `${Math.max(12, value / maxExpense * 100)}%` }}><span /></i>
          ))}
        </div>
        <div className="chart-labels">{monthlyExpenses.map(([month])=><span key={month}>{Number(month.slice(5))}월</span>)}</div>
      </article>

      <article className="panel allocation-panel">
        <div className="panel-head"><div><span className="eyebrow">포트폴리오</span><h2>자산 구성</h2></div><strong>100%</strong></div>
        <div className="allocation-bar">{allocations.map((item)=><i key={item.label} className={`a-${item.className}`} style={{width:`${percentage(item.value, portfolio.totalAssets)}%`}} />)}</div>
        <div className="legend-grid">
          {allocations.map((item)=><span key={item.label}><i className={`dot ${item.className}`} />{item.label} <b>{percentage(item.value, portfolio.totalAssets).toFixed(1)}%</b></span>)}
        </div>
      </article>
    </section>
  );
}

function Family({ hidden, portfolio, members }: { hidden: boolean; portfolio: Portfolio; members: Record<string,number> }) {
  const memberRows = [
    {name:"성근",value:members["성근"]||0,className:"man",color:"#7895b6"},
    {name:"지우",value:members["지우"]||0,className:"woman",color:"#d38a90"},
    {name:"윤재",value:members["윤재"]||0,className:"child",color:"#85a98b"},
    ...(members["공통"] ? [{name:"공통",value:members["공통"],className:"common",color:"#c5ae79"}] : []),
  ];
  let cursor = 0;
  const donutStops = memberRows.map((member)=>{const start=cursor;cursor+=percentage(member.value,portfolio.totalAssets);return `${member.color} ${start}% ${cursor}%`}).join(",");
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="가족별" title="함께 모은 우리 가족 자산" copy="성근, 지우, 윤재의 자산과 공동 자산을 한 화면에서 확인해요." />
      <article className="panel family-share">
        <div className="panel-head"><div><span className="eyebrow">전체 자산 비중</span><h2>함께 만드는 포트폴리오</h2></div></div>
        <div className="donut family-donut" style={{background:donutStops?`conic-gradient(${donutStops})`:undefined}}><div><small>총 자산</small><strong><Amount hidden={hidden}>{compactMoney(portfolio.totalAssets)}</Amount></strong></div></div>
        <div className="member-list">
          {memberRows.map((member)=><div key={member.name}><span className={`avatar ${member.className}`}>{member.name.slice(0,1)}</span><p><b>{member.name}</b><small><Amount hidden={hidden}>{compactMoney(member.value)}</Amount></small></p><strong>{percentage(member.value,portfolio.totalAssets).toFixed(1)}%</strong></div>)}
        </div>
      </article>
      <div className="member-cards">
        {memberRows.filter((member)=>member.name!=="공통").map((member,index)=><article className="member-card" key={member.name}><div className={`avatar ${member.className}`}>{member.name.slice(0,1)}</div><span className="eyebrow">{member.name} 자산</span><h2><Amount hidden={hidden}>{compactMoney(member.value)}</Amount></h2><div className={index===1?"mini-bars pink-bars":"mini-bars"}><i style={{width:`${percentage(member.value,portfolio.totalAssets)}%`}}/><i style={{width:"0%"}}/><i style={{width:"0%"}}/></div><small>{member.value?"가장 최근 업로드 기준":`${member.name} 자료를 업로드해 주세요`}</small></article>)}
      </div>
    </section>
  );
}

function HoldingCard({ item, index, totalValue, hidden, assetHidden, readOnly, onToggleHidden, onSave, onOpenReport }: { item: HoldingData; index: number; totalValue: number; hidden: boolean; assetHidden: boolean; readOnly:boolean; onToggleHidden:()=>void; onSave: (id: number, data: Partial<HoldingData>)=>Promise<void>; onOpenReport:(item:HoldingData)=>void }) {
  const [editing, setEditing] = useState(false);
  const [ticker, setTicker] = useState(item.ticker);
  const [target, setTarget] = useState(item.target_price ? String(item.target_price) : "");
  const estimated = item.quantity_source === "estimated_from_import_value";
  const profit = item.market_value-item.principal;
  const returnPercent = item.return_rate*100;
  const weight = percentage(item.market_value,totalValue);
  const meterPosition = Math.max(2,Math.min(98,50+returnPercent/2));
  const trendClass = returnPercent>0?"gain":returnPercent<0?"loss":"flat";
  const masked = hidden || assetHidden;
  return <article className={`holding-card ${trendClass} ${index<3?"top-holding":""} ${assetHidden?"asset-is-hidden":""}`}>
    <button className="holding-main" aria-expanded={readOnly?undefined:editing} onClick={()=>!readOnly&&setEditing(!editing)}>
      <span className="holding-rank">{String(index+1).padStart(2,"0")}</span>
      <span className="asset-logo">{item.name.slice(0,1)}</span>
      <div className="holding-identity"><b>{item.name}</b><small><em>{item.broker||"금융사 미지정"}</em><em>{item.owner}</em><em>{item.ticker||"티커 확인 전"}</em></small></div>
      <span className="holding-weight-ring" style={{background:`conic-gradient(var(--holding-accent) ${Math.min(weight,100)}%,#ecebe4 0)`}}><span><b>{weight.toFixed(1)}</b><small>%</small></span></span>
    </button>
    <div className="holding-infographic">
      <div className="holding-stat primary"><span>평가액</span><strong><Amount hidden={masked}>{compactMoney(item.market_value)}</Amount></strong></div>
      <div className="holding-stat"><span>투자 원금</span><strong><Amount hidden={masked}>{compactMoney(item.principal)}</Amount></strong></div>
      <div className="holding-stat"><span>평가 손익</span><strong className={profit<0?"negative":"positive"}><Amount hidden={masked}>{profit>=0?"+":""}{compactMoney(profit)}</Amount></strong></div>
      <div className="holding-stat"><span>현재가</span><strong>{item.current_price?<Amount hidden={masked}>{money(item.current_price)} {item.currency}</Amount>:"갱신 전"}</strong></div>
      <div className="return-visual" aria-label={`${item.name} 수익률 ${returnPercent.toFixed(1)}퍼센트`}>
        <div className="return-caption"><span>손실</span><b className={returnPercent<0?"negative":"positive"}><Amount hidden={masked}>{returnPercent>=0?"+":""}{returnPercent.toFixed(1)}%</Amount></b><span>수익</span></div>
        <div className="return-track"><i className="zero-line"/><i className="return-marker" style={{left:`${meterPosition}%`}}/><span className="loss-zone"/><span className="gain-zone"/></div>
      </div>
      <div className="holding-detail-line"><span><Amount hidden={masked}>{item.quantity?`${money(item.quantity)}${isCryptoHolding(item)?"개":"주"} 보유`:"수량 확인 전"}</Amount></span><span>{item.price_updated_at?`${item.price_updated_at.slice(5,16).replace("T"," ")} 갱신`:"뱅크샐러드 평가액"}</span><button type="button" onClick={()=>onOpenReport(item)}>상세 분석</button><button type="button" className="holding-visibility" onClick={onToggleHidden}>{assetHidden?"표시":"숨기기"}</button>{!readOnly&&<b>{editing?"설정 닫기":"티커·목표가 설정 ›"}</b>}</div>
    </div>
    {!readOnly&&editing && <form className="holding-editor" onSubmit={async(event)=>{event.preventDefault();await onSave(item.id,{ticker,target_price:Number(target)||0,target_alert_enabled:true});setEditing(false)}}>
      <label>티커<input value={ticker} onChange={(event)=>setTicker(event.target.value)} placeholder="005930.KS / AAPL"/></label>
      <label>목표가 ({item.currency})<input type="number" min="0" step="any" value={target} onChange={(event)=>setTarget(event.target.value)} placeholder="목표가"/></label>
      <button className="primary-button small">저장</button>
      <small>{estimated ? "수량은 최초 평가액과 현재가로 추정됨" : item.quantity ? `${money(item.quantity)}주` : "현재가 갱신 시 수량을 자동 추정"} · 목표 도달 시 Telegram 알림</small>
    </form>}
  </article>;
}

function StockReportModal({ item, report, loading, error, onClose }: { item: HoldingData; report: StockReport | null; loading: boolean; error: string; onClose:()=>void }) {
  const [copiedPrompt,setCopiedPrompt] = useState("");
  async function copyPrompt(id:string,text:string) {
    await navigator.clipboard.writeText(text);
    setCopiedPrompt(id);
    window.setTimeout(()=>setCopiedPrompt(""),1800);
  }
  return <div className="modal-backdrop report-backdrop" onMouseDown={onClose}><article className="stock-report-modal" onMouseDown={(event)=>event.stopPropagation()}>
    <header className="report-head"><div><span className="eyebrow">종목 상세 · {item.ticker||"티커 미설정"}</span><h2>{item.name}</h2><p>OpenDART 자체 분석, 최신 뉴스와 증권사 리서치를 한곳에서 확인합니다.</p></div><button onClick={onClose} aria-label="닫기">×</button></header>
    {loading&&<div className="report-loading"><i/><p>공시와 재무제표를 불러오는 중이에요.</p></div>}
    {error&&<div className="report-notice error">{error}</div>}
    {!loading&&report&&<div className="report-body">
      <section className="report-section"><div className="report-title"><div><span className="eyebrow">OpenDART · LLM 불필요</span><h3>상세 종목 분석</h3></div>{report.dart.basis&&<span className="chip">{report.dart.basis}</span>}</div><p className={`report-notice ${report.dart.available?"ready":""}`}>{report.dart.message}</p>
        {report.dart.available&&<><div className="report-metrics">{report.dart.metrics.map((metric)=><article key={metric.key}><span>{metric.label}</span><strong>{compactMoney(metric.current)}</strong><small className={metric.change_rate==null?"":metric.change_rate<0?"negative":"positive"}>{metric.change_rate==null?"전년 비교 없음":`전년 대비 ${metric.change_rate>=0?"+":""}${(metric.change_rate*100).toFixed(1)}%`}</small></article>)}</div><div className="ratio-row">{report.dart.ratios.map((ratio)=><span key={ratio.label}><small>{ratio.label}</small><b>{(ratio.value*100).toFixed(1)}%</b></span>)}</div>{report.dart.analysis&&<div className="report-analysis"><div><h4>확인된 흐름</h4><ul>{report.dart.analysis.observations.map((text)=><li key={text}>{text}</li>)}</ul></div><div><h4>함께 볼 점</h4><ul>{report.dart.analysis.cautions.map((text)=><li key={text}>{text}</li>)}</ul></div></div>}</>}
      </section>
      <section className="report-section"><div className="report-title"><div><span className="eyebrow">{report.news.provider}</span><h3>최근 종목 뉴스</h3></div></div><p className={`report-notice ${report.news.items.length?"ready":""}`}>{report.news.message}</p><div className="news-list">{report.news.items.map((news)=><a key={`${news.url}-${news.published_at}`} href={news.url} target="_blank" rel="noreferrer"><div><time>{news.published_at.slice(0,10)||"날짜 미상"}</time><b>{news.title}</b><p>{news.summary}</p></div><span>↗</span></a>)}</div></section>
      <section className="report-section"><div className="report-title"><div><span className="eyebrow">External research</span><h3>증권사 리포트 검색</h3></div></div><div className="research-links">{report.broker_research.length?report.broker_research.map((link)=><a key={`${link.provider}-${link.kind}`} href={link.url} target="_blank" rel="noreferrer"><span>{link.provider.slice(0,2)}</span><div><b>{link.title}</b><small>{link.description}</small></div><i>↗</i></a>):<p className="report-notice">국내 6자리 종목코드를 설정하면 검색할 수 있습니다.</p>}</div></section>
      <section className="report-section"><div className="report-title"><div><span className="eyebrow">Copy & analyze</span><h3>종목분석 프롬프트</h3></div></div><div className="prompt-list">{report.prompts.map((prompt)=><details key={prompt.id} className="prompt-card"><summary><div><b>{prompt.title}</b><small>{prompt.description}</small></div><span>펼쳐보기⌄</span></summary><div className="prompt-content"><button onClick={()=>void copyPrompt(prompt.id,prompt.text)}>{copiedPrompt===prompt.id?"✓ 복사됨":"프롬프트 복사"}</button><pre>{prompt.text}</pre></div></details>)}</div></section>
      {!!report.dart.disclosures.length&&<section className="report-section"><div className="report-title"><div><span className="eyebrow">최근 1년</span><h3>주요 공시</h3></div></div><div className="disclosure-list">{report.dart.disclosures.map((item)=><a key={`${item.date}-${item.url}`} href={item.url} target="_blank" rel="noreferrer"><time>{item.date.replace(/(\d{4})(\d{2})(\d{2})/,"$1.$2.$3")}</time><b>{item.title}</b><span>↗</span></a>)}</div></section>}
    </div>}
  </article></div>;
}

function GowalterPromptPanel({ promptData, busy, onAnalyze }: { promptData: GowalterPrompt; busy: string; onAnalyze:(prompt?:string)=>Promise<void> }) {
  const [promptDraft,setPromptDraft] = useState(promptData.prompt);
  return <article className="panel gowalter-prompt-panel">
    <div className="panel-head"><div><span className="eyebrow">Gowalter blog lens</span><h2>관점 프롬프트</h2></div><span className={`prompt-status ${promptData.archive_ready?"ready":"fallback"}`}>{promptData.archive_ready?"아카이브 연결":"기본 관점"}</span></div>
    <p className="prompt-intro">블로그의 확신을 그대로 따르지 않고, 거시 흐름과 이벤트·추세 구분을 우리 포트폴리오의 비중과 손실 허용 범위로 다시 해석해요.</p>
    <div className="lens-flow" aria-label="Gowalter 분석 순서"><span>거시</span><i>→</i><span>이벤트·추세</span><i>→</i><span>구조적 성장</span><i>→</i><span>분할 대응</span></div>
    <label className="prompt-editor-label" htmlFor="gowalter-prompt">실제 AI에 전달되는 프롬프트</label>
    <textarea id="gowalter-prompt" className="prompt-editor" value={promptDraft} maxLength={16000} onChange={(event)=>setPromptDraft(event.target.value)} />
    {promptData.related_posts.length?<div className="related-posts"><span>현재 종목과 연결된 글</span>{promptData.related_posts.slice(0,3).map((post)=><a key={`${post.published_at}-${post.title}`} href={post.url||undefined} target={post.url?"_blank":undefined} rel={post.url?"noreferrer":undefined}><b>{post.title}</b><small>{post.published_at||"날짜 미상"}</small></a>)}</div>:null}
    <div className="prompt-actions"><small>{promptData.source_label}</small><button className="text-button" disabled={busy==="ai"} onClick={()=>setPromptDraft(promptData.prompt)}>원문 복원</button><button className="primary-button small" disabled={!promptDraft.trim()||Boolean(busy)} onClick={()=>void onAnalyze(promptDraft)}>{busy==="ai"?"분석 중…":"이 프롬프트로 분석"}</button></div>
  </article>;
}

function Stocks({ hidden, readOnly, ownerFilter, onOwnerFilter, holdings, hiddenAssetKeys, summary, exchangeRate, analysis, promptData, busy, onImport, onRefresh, onAnalyze, onSave, onOpenReport, onToggleAssetHidden, onAdd }: { hidden: boolean; readOnly:boolean; ownerFilter:string; onOwnerFilter:(owner:string)=>void; holdings: HoldingData[]; hiddenAssetKeys: string[]; summary?: AssetSummary; exchangeRate: ServerState["exchange_rate"] | null; analysis: ServerState["latest_analysis"]; promptData: GowalterPrompt | null; busy: string; onImport:(files:FileList|null,owner:string)=>void; onRefresh:()=>void; onAnalyze:(prompt?:string)=>Promise<void>; onSave:(id:number,data:Partial<HoldingData>)=>Promise<void>; onOpenReport:(item:HoldingData)=>void; onToggleAssetHidden:(key:string,label:string)=>void; onAdd:()=>void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importOwner,setImportOwner] = useState("성근");
  const principal = summary?.investment_principal || holdings.reduce((sum,item)=>sum+item.principal,0);
  const value = summary?.investment_value || holdings.reduce((sum,item)=>sum+item.market_value,0);
  const pnl = value-principal;
  const allocationTotal = holdings.reduce((sum,item)=>sum+item.market_value,0);
  const allocationColors = ["#345f4d","#7895b6","#d38a90","#c5a86d","#8f85b2","#72a090"];
  const leadingAllocations = holdings.slice(0,6).map((item,index)=>({
    key:String(item.id),
    name:item.name,
    value:item.market_value,
    color:allocationColors[index],
  }));
  const remainingValue = holdings.slice(6).reduce((sum,item)=>sum+item.market_value,0);
  const allocations = remainingValue>0
    ? [...leadingAllocations,{key:"other",name:`기타 ${holdings.length-6}종목`,value:remainingValue,color:"#c8cbc4"}]
    : leadingAllocations;
  const allocationStops = allocations.map((item,index)=>{
    const start = allocations.slice(0,index).reduce((sum,entry)=>sum+percentage(entry.value,allocationTotal),0);
    const end = start+percentage(item.value,allocationTotal);
    return `${item.color} ${start}% ${end}%`;
  }).join(",");
  const topOneWeight = percentage(holdings[0]?.market_value||0,allocationTotal);
  const topFiveWeight = percentage(holdings.slice(0,5).reduce((sum,item)=>sum+item.market_value,0),allocationTotal);
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="주식 / ETF" title="꾸준히, 멀리 보기" copy="뱅크샐러드 종목을 현재 시세와 목표가 알림까지 연결해요." />
      {!readOnly&&<div className="owner-filter" aria-label="소유자별 종목 필터">{["전체","성근","지우","윤재","공통"].map((owner)=><button type="button" key={owner} className={ownerFilter===owner?"active":""} onClick={()=>onOwnerFilter(owner)}>{owner}</button>)}</div>}
      {!readOnly&&<div className="upload-row stock-upload"><select className="owner-select" aria-label="종목 파일 소유자" value={importOwner} onChange={(event)=>setImportOwner(event.target.value)}><option>성근</option><option>지우</option><option>윤재</option><option>공통</option></select><button className="primary-button" disabled={Boolean(busy)} onClick={()=>inputRef.current?.click()}>{busy==="import"?"파일 반영 중…":"＋ 뱅크샐러드·종목 파일"}</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xlsm,.csv" onChange={(event)=>{onImport(event.target.files,importOwner);event.target.value=""}}/><span>선택한 가족의 종목으로 저장</span></div>}
      <article className="investment-hero stock-hero"><span>투자 원금 {compactMoney(principal)}</span><h2><Amount hidden={hidden}>{compactMoney(value)}</Amount></h2><strong className={pnl<0?"negative":""}>{pnl>=0?"+":""}{compactMoney(pnl)} ({principal?(pnl/principal*100).toFixed(1):0}%)</strong><div className="spark-bars">{[30,42,36,49,55,51,68,73,69,81,88,96].map((v,i)=><i key={i} style={{height:`${v}%`}} />)}</div></article>
      <div className="market-actions"><div><span className="eyebrow">환율</span><b>{exchangeRate?.rate?`1 USD = ${money(exchangeRate.rate)}원`:"갱신 전"}</b></div>{!readOnly&&<><button className="primary-button" disabled={Boolean(busy)} onClick={onRefresh}>{busy==="market"?"갱신 중…":"↻ 환율·현재가 갱신"}</button><button className="filter-button" disabled={Boolean(busy)} onClick={()=>void onAnalyze()}>{busy==="ai"?"분석 중…":"Gowalter AI 분석"}</button></>}</div>
      {holdings.length>0&&<article className="panel portfolio-allocation">
        <div className="panel-head"><div><span className="eyebrow">전체 종목 비중</span><h2>포트폴리오 한눈에 보기</h2></div><span className="allocation-total-chip">합계 100%</span></div>
        <div className="allocation-overview">
          <div className="portfolio-donut" role="img" aria-label={`전체 평가액 중 ${allocations.map((item)=>`${item.name} ${percentage(item.value,allocationTotal).toFixed(1)}퍼센트`).join(", ")}`} style={{background:allocationStops?`conic-gradient(${allocationStops})`:"#ecece6"}}>
            <div><small>전체 평가액</small><strong><Amount hidden={hidden}>{compactMoney(allocationTotal)}</Amount></strong><span>100%</span></div>
          </div>
          <div className="concentration-grid">
            <div><span>1위 종목</span><strong>{topOneWeight.toFixed(1)}%</strong><small>{holdings[0]?.name||"-"}</small></div>
            <div><span>상위 5개</span><strong>{topFiveWeight.toFixed(1)}%</strong><small>집중도</small></div>
            <div><span>분산 종목</span><strong>{holdings.length}개</strong><small>현재 보유</small></div>
          </div>
        </div>
        <div className="allocation-stack" aria-hidden="true">{allocations.map((item)=><i key={item.key} style={{width:`${percentage(item.value,allocationTotal)}%`,background:item.color}} />)}</div>
        <div className="allocation-rows">
          {allocations.map((item,index)=><div className="allocation-row" key={item.key}>
            <span className="allocation-color" style={{background:item.color}} />
            <span className="allocation-rank">{item.key==="other"?"·":String(index+1).padStart(2,"0")}</span>
            <div><b>{item.name}</b><span className="allocation-mini-track"><i style={{width:`${percentage(item.value,allocationTotal)}%`,background:item.color}} /></span></div>
            <p><strong>{percentage(item.value,allocationTotal).toFixed(1)}%</strong><small><Amount hidden={hidden}>{compactMoney(item.value)}</Amount></small></p>
          </div>)}
        </div>
        {holdings.length>6&&<p className="allocation-note">가독성을 위해 평가액 상위 6개 종목을 표시하고, 나머지 {holdings.length-6}개 종목은 기타로 합쳤어요.</p>}
      </article>}
      {!readOnly&&analysis&&<article className="panel ai-panel"><div className="panel-head"><div><span className="eyebrow">{analysis.provider} · {analysis.model}</span><h2>최근 AI 분석</h2></div></div><pre>{analysis.text}</pre></article>}
      {!readOnly&&(promptData?<GowalterPromptPanel promptData={promptData} busy={busy} onAnalyze={onAnalyze}/>:<article className="panel gowalter-prompt-panel prompt-loading"><span className="eyebrow">Gowalter blog lens</span><h2>관점 프롬프트를 준비하고 있어요</h2></article>)}
      <div className="section-title-row"><div><span className="eyebrow">보유 종목 {holdings.length}개</span><h2>내 포트폴리오</h2></div>{!readOnly&&<button className="primary-button small" onClick={onAdd}>＋ 자산 추가</button>}</div>
      <div className="holding-list">{holdings.length?holdings.map((item,index)=><HoldingCard key={item.id} item={item} index={index} totalValue={allocationTotal} hidden={hidden} assetHidden={hiddenAssetKeys.includes(assetKey(item))} readOnly={readOnly} onToggleHidden={()=>onToggleAssetHidden(assetKey(item),item.name)} onSave={onSave} onOpenReport={onOpenReport}/>):<article className="empty-card">{readOnly?"내 이름으로 등록된 투자자산이 없습니다.":"뱅크샐러드 파일을 올리거나 자산을 직접 추가해 주세요."}</article>}</div>
    </section>
  );
}

function Crypto({ hidden, readOnly, holdings, hiddenAssetKeys, busy, onRefresh, onAdd, onToggleAssetHidden, onSave, onOpenReport }: { hidden: boolean; readOnly:boolean; holdings: HoldingData[]; hiddenAssetKeys:string[]; busy:string; onRefresh:()=>void; onAdd:()=>void; onToggleAssetHidden:(key:string,label:string)=>void; onSave:(id:number,data:Partial<HoldingData>)=>Promise<void>; onOpenReport:(item:HoldingData)=>void }) {
  const value = holdings.reduce((sum,item)=>sum+item.market_value,0);
  const principal = holdings.reduce((sum,item)=>sum+item.principal,0);
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="암호화폐" title="코인도 원화로 한눈에" copy="거래소와 별개로 수량을 등록하면 원화 시세와 평가금액을 갱신해요." />
      <article className="investment-hero crypto-hero"><span>암호화폐 평가금액</span><h2><Amount hidden={hidden}>{compactMoney(value)}</Amount></h2><strong className={value-principal<0?"negative":""}>{value-principal>=0?"+":""}{compactMoney(value-principal)}</strong><div className="crypto-rings"><i /><i /><i /></div></article>
      <div className="market-actions crypto-actions"><div><span className="eyebrow">KRW 시세</span><b>Yahoo Finance 원화 페어</b></div>{!readOnly&&<><button type="button" className="primary-button" disabled={Boolean(busy)} onClick={onRefresh}>{busy==="market"?"갱신 중…":"↻ 원화 시세 갱신"}</button><button type="button" className="filter-button crypto-add-button" onClick={onAdd}>＋ 암호화폐 추가</button></>}</div>
      <div className="holding-list">{holdings.length?holdings.map((item,index)=><HoldingCard key={item.id} item={item} index={index} totalValue={value} hidden={hidden} assetHidden={hiddenAssetKeys.includes(assetKey(item))} readOnly={readOnly} onToggleHidden={()=>onToggleAssetHidden(assetKey(item),item.name)} onSave={onSave} onOpenReport={onOpenReport}/>):<article className="empty-card crypto-empty">{readOnly?"내 이름으로 등록된 암호화폐가 없습니다.":"비트코인, 이더리움 등 보유 코인을 직접 추가해 주세요."}{!readOnly&&<button type="button" className="primary-button small" onClick={onAdd}>첫 암호화폐 추가</button>}</article>}</div>
    </section>
  );
}

function RealEstate({ hidden, readOnly, assetHidden, onToggleHidden, onAddDebt, portfolio, debts }: { hidden: boolean; readOnly:boolean; assetHidden:boolean; onToggleHidden:()=>void; onAddDebt:()=>void; portfolio: Portfolio; debts:DebtData[] }) {
  const equity = Math.max(0, portfolio.realEstate - portfolio.totalDebts);
  const debtRatio = percentage(portfolio.totalDebts, portfolio.realEstate);
  return (
    <section className="screen fade-in">
      <div className="asset-heading-row"><ScreenHeading eyebrow="부동산" title="우리 집의 오늘 가치" copy="매입가, 현재 시세와 대출을 함께 관리해요." /><button type="button" className={`asset-visibility-button ${assetHidden?"active":""}`} aria-pressed={assetHidden} onClick={onToggleHidden}>{assetHidden?"✓ 부동산 표시하기":"부동산 금액 숨기기"}</button></div>
      {assetHidden&&<div className="asset-privacy-banner">이 기기에서 부동산 금액을 개별 숨김 처리했습니다.</div>}
      <article className="property-card"><div className="property-visual"><span>REAL ESTATE</span><div className="building"><i/><i/><i/><i/><i/><i/></div></div><div className="property-content"><span className="status-pill">뱅크샐러드</span><h2>등록 부동산</h2><p>{portfolio.asOf || "업데이트 전"} 평가 기준</p><div className="property-price"><span>현재 평가금액</span><strong><Amount hidden={hidden || assetHidden}>{compactMoney(portfolio.realEstate)}</Amount></strong><small>원본 파일의 재무현황 합계</small></div></div></article>
      <div className="metric-grid property-metrics"><article className="metric-card"><p>총 부채</p><strong><Amount hidden={hidden || assetHidden}>{compactMoney(portfolio.totalDebts)}</Amount></strong><small>자산현황에 연결된 부채</small></article><article className="metric-card"><p>부동산 순가치</p><strong><Amount hidden={hidden || assetHidden}>{compactMoney(equity)}</Amount></strong><small>부채비율 {debtRatio.toFixed(1)}%</small></article></div>
      <article className="panel loan-panel"><div className="panel-head"><div><span className="eyebrow">부채 비율</span><h2>부동산 대비</h2></div><strong><Amount hidden={assetHidden}>{debtRatio.toFixed(1)}%</Amount></strong></div><div className="progress"><i style={{width:`${Math.min(debtRatio,100)}%`}} /></div><div className="loan-stats"><span>부동산 평가액 <b><Amount hidden={hidden || assetHidden}>{compactMoney(portfolio.realEstate)}</Amount></b></span><span>총 부채 <b><Amount hidden={hidden || assetHidden}>{compactMoney(portfolio.totalDebts)}</Amount></b></span></div></article>
      <div className="section-title-row"><div><span className="eyebrow">등록 대출 {debts.length}건</span><h2>부동산 부채</h2></div>{!readOnly&&<button className="primary-button small" onClick={onAddDebt}>＋ 부채 추가</button>}</div>
      <div className="debt-list">{debts.length?debts.map((debt)=><article className="debt-row" key={debt.id}><span className="debt-symbol">₩</span><div><b>{debt.name}</b><small>{debt.provider||"금융사 미지정"} · {debt.owner} · {debt.debt_type}</small></div><p><strong><Amount hidden={hidden || assetHidden}>{compactMoney(debt.balance)}</Amount></strong><small>{debt.interest_rate?`연 ${debt.interest_rate.toFixed(2)}%`:"금리 미입력"}{debt.manual?" · 직접 등록":" · 뱅크샐러드"}</small></p></article>):<article className="empty-card">뱅크샐러드에 없는 주담대·전세대출을 직접 추가할 수 있어요.</article>}</div>
    </section>
  );
}

function Ledger({ hidden, transactions, onImport }: { hidden: boolean; transactions: Transaction[]; onImport: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const latestMonth = transactions.map((item)=>item.date.slice(0,7)).sort().at(-1) || "2026-08";
  const monthItems = transactions.filter((item)=>item.date.startsWith(latestMonth));
  const expenses = monthItems.filter((item)=>item.kind !== "income");
  const income = monthItems.filter((item)=>item.kind === "income").reduce((sum,item)=>sum+item.amount,0);
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const elapsedDays = Math.max(...monthItems.map((item)=>Number(item.date.slice(-2))), 1);
  const categories = [...expenses.reduce((result,item)=>result.set(item.category,(result.get(item.category)||0)+item.amount),new Map<string,number>()).entries()].sort((a,b)=>b[1]-a[1]);
  const leading = categories.slice(0,3);
  const rest = categories.slice(3).reduce((sum,[,value])=>sum+value,0);
  const categoryRows = [...leading, ...(rest ? [["기타",rest] as [string,number]] : [])];
  const chartColors = ["#6da59d", "#e2aa87", "#859db8", "#b7addc"];
  let chartCursor = 0;
  const chartStops = categoryRows.map(([,value],index)=>{
    const start = chartCursor;
    chartCursor += percentage(value,total);
    return `${chartColors[index]} ${start}% ${chartCursor}%`;
  }).join(",");
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow={`${latestMonth.slice(0,4)}년 ${Number(latestMonth.slice(5))}월`} title="이번 달 생활비" copy="뱅크샐러드 내역에서 이체를 제외하고 지출과 수입을 정리했어요." />
      <div className="upload-row"><button className="primary-button" onClick={()=>inputRef.current?.click()}>＋ 카드·뱅크샐러드 내역 불러오기</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xlsm,.csv" onChange={(event)=>{ onImport(event.target.files); event.target.value = ""; }} /><button className="icon-button" aria-label="자동 분류 새로고침">↻</button></div>
      <div className="metric-grid ledger-metrics"><article className="metric-card wide"><p>총 지출</p><strong><Amount hidden={hidden}>{compactMoney(total)}</Amount></strong><small>이체 제외 · {expenses.length}건</small></article><article className="metric-card"><p>일 평균</p><strong><Amount hidden={hidden}>{compactMoney(total/elapsedDays)}</Amount></strong><small>{elapsedDays}일 기준</small></article><article className="metric-card"><p>총 수입</p><strong><Amount hidden={hidden}>{compactMoney(income)}</Amount></strong><small>{monthItems.filter((item)=>item.kind==="income").length}건</small></article></div>
      <article className="panel spending-panel"><div className="panel-head"><div><span className="eyebrow">항목별 지출</span><h2>어디에 썼을까요?</h2></div><span className="chip">{Number(latestMonth.slice(5))}월</span></div><div className="spending-chart"><div className="donut expense-donut" style={{background:chartStops ? `conic-gradient(${chartStops})` : undefined}}><div><small>합계</small><strong><Amount hidden={hidden}>{compactMoney(total)}</Amount></strong></div></div><div className="expense-legend">{categoryRows.map(([category,value],index)=><span key={category}><i className="dot" style={{background:chartColors[index]}}/>{category} <b>{percentage(value,total).toFixed(0)}%</b></span>)}</div></div></article>
      <div className="section-title-row"><div><span className="eyebrow">최근 내역</span><h2>결제 내역</h2></div><button className="text-button">전체보기</button></div>
      <div className="transaction-list">{transactions.slice(0,8).map((item)=><article className="transaction-row" key={item.id}><span className="transaction-icon">{item.kind === "income" ? "+" : item.category === "식비" ? "○" : item.category === "교통" ? "↗" : "◇"}</span><div><b>{item.merchant}</b><small>{item.date.slice(5).replace("-",".")} · {item.category} · {item.owner}</small></div><strong className={item.kind === "income" ? "positive" : ""}><Amount hidden={hidden}>{item.kind === "income" ? "+" : "-"}{money(item.amount)}원</Amount></strong></article>)}</div>
    </section>
  );
}

function CalendarScreen({ events, readOnly, status, checking, deletingId, onCheck, onAdd, onDelete }: { events: CalendarEvent[]; readOnly:boolean; status:CalendarConnectionStatus|null; checking:boolean; deletingId:string; onCheck:()=>void; onAdd: (date?:string) => void; onDelete:(event:CalendarEvent)=>void }) {
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + days }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  const monthEvents = events.filter((event)=>event.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`));
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="Google Calendar" title="우리의 공동 일정" copy="서로 추가한 일정이 Google 캘린더와 함께 업데이트돼요." />
      {!readOnly&&<article className={`calendar-connection ${status?.connected?"connected":status?"failed":""}`}>
        <span className="calendar-connection-icon">G</span><div><b>{status?.connected?status.calendarName||"Google Calendar 연결됨":"Google Calendar 연동 상태"}</b><small>{status?.message||"실제 API 연결을 확인해 보세요."}</small></div><button type="button" disabled={checking} onClick={onCheck}>{checking?"확인 중…":"연결 확인"}</button>
      </article>}
      {readOnly&&<div className="guest-notice">게스트 모드 · 내 이름으로 등록된 일정만 표시합니다.</div>}
      <div className="calendar-toolbar"><button onClick={()=>setCursor(new Date(year,month-1,1))} aria-label="이전 달">‹</button><h2>{year}. {String(month+1).padStart(2,"0")}</h2><button onClick={()=>setCursor(new Date(year,month+1,1))} aria-label="다음 달">›</button><button className="today-button" onClick={()=>setCursor(new Date())}>오늘</button></div>
      <article className="calendar-card"><div className="weekdays">{["일","월","화","수","목","금","토"].map((day)=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day,index)=>{
        const dateKey = day ? `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` : "";
        const dayEvents = monthEvents.filter((item)=>item.date===dateKey);
        const today = new Date();
        const isToday = year===today.getFullYear() && month===today.getMonth() && day===today.getDate();
        return <div className={`${day?"":"empty"} ${isToday?"today":""}`} key={index}>{day && <button type="button" disabled={readOnly} onClick={()=>onAdd(dateKey)} aria-label={readOnly?dateKey:`${dateKey} 일정 추가`}><span>{day}</span><span className="event-dots">{dayEvents.slice(0,3).map((event)=><i key={event.id} className={`event-dot ${event.color || "mint"}`} title={event.title}/>)}</span></button>}</div>
      })}</div></article>
      <div className="section-title-row"><div><span className="eyebrow">다가오는 일정</span><h2>이번 달</h2></div>{!readOnly&&<button className="primary-button small" onClick={()=>onAdd()}>＋ 일정 추가</button>}</div>
      <div className="event-list">{monthEvents.length?monthEvents.map(event=><article key={event.id} className="event-row"><time><strong>{Number(event.date.slice(-2))}</strong><small>{month+1}월</small></time><i className={`event-line ${event.color || "mint"}`} /><div><b>{event.title}</b><small>{event.time || "종일"} · {event.owner}{event.googleEventId?" · Google 동기화":" · 앱 저장"}</small></div>{!readOnly&&<button type="button" className="event-delete" disabled={deletingId===event.id} onClick={()=>onDelete(event)} aria-label={`${event.title} 삭제`}>{deletingId===event.id?"…":"삭제"}</button>}</article>):<div className="calendar-empty">{readOnly?"등록된 내 일정이 없습니다.":"날짜를 눌러 가족 일정을 추가해 보세요."}</div>}</div>
      {!readOnly&&<a className="google-card" href="https://calendar.google.com" target="_blank" rel="noreferrer"><span className="google-mark">G</span><div><b>Google 캘린더에서 열기</b><small>공유 캘린더의 전체 일정을 확인하세요</small></div><span>↗</span></a>}
    </section>
  );
}

const integrationLabels: Record<string,[string,string,string]> = {
  database:["S","SQLite 누적 저장","자산·가계부·분석·알림 이력"],
  bank_salad:["X","뱅크샐러드 업로드","가계부·자산 현황"],
  market:["↗","환율·현재가","Yahoo Finance / yfinance"],
  auto_refresh:["↻","4시간 자동 시세 갱신","한국시간 정시 스케줄"],
  openai:["AI","AI 포트폴리오 분석","OpenAI 또는 로컬 분석"],
  gowalter:["G","Gowalter 관점 아카이브","블로그·투자 원칙·어록"],
  opendart:["D","OpenDART 기업 리포트","공시·재무제표 기반 정형 분석"],
  naver_news:["N","네이버 최신 뉴스","NAVER API HUB 뉴스 검색"],
  telegram:["T","Telegram 목표가 알림","목표가 도달 알림"],
  google_calendar:["G","Google 캘린더","공유 일정 읽기 · 추가"],
};

function Settings({ protectedMode, integrations, busy, onProbe }: { protectedMode: boolean; integrations: IntegrationStatus; busy: string; onProbe:()=>void }) {
  const [versionInfo,setVersionInfo] = useState<VersionInfo|null>(null);
  const [versionError,setVersionError] = useState(false);
  async function loadVersion() {
    try {
      setVersionInfo(await requestVersionInfo());
      setVersionError(false);
    } catch {
      setVersionError(true);
    }
  }
  useEffect(()=>{
    let active = true;
    void requestVersionInfo().then((info)=>{if(active)setVersionInfo(info);}).catch(()=>{if(active)setVersionError(true);});
    return ()=>{active=false;};
  },[]);
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="설정" title="우리 집 데이터 관리" copy="연동 상태와 보안 설정을 한곳에서 확인해요." />
      <article className="profile-panel"><div className="couple-avatars"><span className="avatar man">성</span><span className="avatar woman">지</span><span className="avatar child">윤</span></div><div><b>성근 · 지우 · 윤재의 집</b><small>FastAPI + SQLite 비공개 자산 서버</small></div><span className="secure-badge">비공개</span></article>
      <div className="settings-group"><div className="settings-title"><h2>외부 연동 상태</h2><button className="text-button" disabled={Boolean(busy)} onClick={onProbe}>{busy==="probe"?"확인 중…":"실제 연결 확인"}</button></div>{Object.entries(integrations).map(([key,status])=>{const label=integrationLabels[key]||["·",key,""];return <button key={key}><span className={`settings-symbol ${key==="google_calendar"?"google":key==="bank_salad"?"excel":"server"}`}>{label[0]}</span><div><b>{label[1]}</b><small>{label[2]}{key==="auto_refresh"&&status.detail?` · ${status.detail}`:""}{status.last_checked_at?` · 최근 ${status.last_checked_at.slice(0,16).replace("T"," ")}`:""}</small></div><em className={status.connected?"connected":""}>{status.message}</em></button>})}</div>
      <div className="settings-group"><h2>보안 및 저장</h2><button><span className="settings-symbol privacy">●</span><div><b>접근 보호</b><small>{protectedMode?"APP_ACCESS_KEY로 보호됨":"현재 로컬 모드"}</small></div><em className={protectedMode?"connected":""}>{protectedMode?"보호 중":"키 설정 권장"}</em></button><button><span className="settings-symbol server">DB</span><div><b>누적 데이터</b><small>업로드·시세·AI·알림 결과를 삭제 없이 기록</small></div><em className="connected">SQLite</em></button></div>
      <div className="settings-group"><h2>앱 정보</h2><button type="button" onClick={()=>void loadVersion()}><span className="settings-symbol version">V</span><div><b>{versionInfo?`모아 v${versionInfo.version}`:"버전 확인 중"}</b><small>{versionInfo?`실행 시작 ${new Intl.DateTimeFormat("ko-KR",{dateStyle:"short",timeStyle:"short"}).format(new Date(versionInfo.started_at))} · 눌러서 다시 확인`:versionError?"버전 정보를 확인하지 못했습니다.":"현재 실행 버전을 읽고 있습니다."}</small></div><em className={versionInfo?"connected":""}>{versionInfo?.revision||"확인 중"}</em></button></div>
      <div className="privacy-note"><b>우리 가족만 볼 수 있어요</b><p>검색엔진에 노출하지 않고, 서버 접근 키와 HTTPS로 보호하도록 설계했습니다.</p></div>
    </section>
  );
}

function QuickAddModal({ onClose, onStock, onCrypto, onDebt, onCalendar, onLedger }: { onClose:()=>void; onStock:()=>void; onCrypto:()=>void; onDebt:()=>void; onCalendar:()=>void; onLedger:()=>void }) {
  const actions = [
    { label:"주식 / ETF", copy:"종목과 보유 수량 직접 등록", symbol:"ST", action:onStock },
    { label:"암호화폐", copy:"코인 수량과 원금 등록", symbol:"₿", action:onCrypto },
    { label:"부동산 부채", copy:"주담대·전세대출 직접 등록", symbol:"₩", action:onDebt },
    { label:"가족 일정", copy:"공용 일정과 Google Calendar", symbol:"CAL", action:onCalendar },
    { label:"가계부 가져오기", copy:"카드·뱅크샐러드 파일 업로드", symbol:"DB", action:onLedger },
  ];
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal quick-add-modal" onMouseDown={(event)=>event.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">Quick add</span><h2>무엇을 추가할까요?</h2></div><button onClick={onClose} aria-label="닫기">×</button></div>
    <div className="quick-add-grid">{actions.map((item)=><button type="button" key={item.label} onClick={()=>{onClose();item.action();}}><span>{item.symbol}</span><div><b>{item.label}</b><small>{item.copy}</small></div><i>›</i></button>)}</div>
  </div></div>;
}

function AssetModal({ initialType, onClose, onSave }: { initialType: HoldingCreatePayload["asset_type"]; onClose:()=>void; onSave:(payload:HoldingCreatePayload)=>Promise<void> }) {
  const [assetType,setAssetType] = useState<HoldingCreatePayload["asset_type"]>(initialType);
  const [saving,setSaving] = useState(false);
  const cryptoPresets = [{name:"비트코인",ticker:"BTC"},{name:"이더리움",ticker:"ETH"},{name:"리플",ticker:"XRP"},{name:"솔라나",ticker:"SOL"}];
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await onSave({
        owner:String(form.get("owner")), asset_type:assetType, broker:String(form.get("broker")),
        name:String(form.get("name")), ticker:String(form.get("ticker")),
        quantity:Number(form.get("quantity")), principal:Number(form.get("principal")) || 0,
      });
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal asset-modal" onMouseDown={(event)=>event.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">직접 등록</span><h2>자산 추가</h2></div><button onClick={onClose} aria-label="닫기">×</button></div>
    <form onSubmit={submit}>
      <div className="form-row"><label>자산 유형<select value={assetType} onChange={(event)=>setAssetType(event.target.value as HoldingCreatePayload["asset_type"])}><option>주식</option><option>ETF</option><option>펀드</option><option>코인</option></select></label><label>소유자<select name="owner" defaultValue="성근"><option>성근</option><option>지우</option><option>윤재</option><option>공통</option></select></label></div>
      {assetType==="코인"&&<div className="asset-presets">{cryptoPresets.map((coin)=><button key={coin.ticker} type="button" onClick={(event)=>{const form=event.currentTarget.closest("form");const name=form?.elements.namedItem("name") as HTMLInputElement|null;const ticker=form?.elements.namedItem("ticker") as HTMLInputElement|null;if(name)name.value=coin.name;if(ticker)ticker.value=coin.ticker;}}>{coin.ticker}</button>)}</div>}
      <label>자산 이름<input name="name" placeholder={assetType==="코인"?"예: 비트코인":"예: 삼성전자"} required autoFocus /></label>
      <div className="form-row"><label>티커·심볼<input name="ticker" placeholder={assetType==="코인"?"BTC":"005930.KS / AAPL"} required={assetType!=="펀드"} /></label><label>금융사·거래소<input name="broker" defaultValue={assetType==="코인"?"직접 입력":"직접 입력"} /></label></div>
      <div className="form-row"><label>보유 수량<input name="quantity" type="number" min="0" step="any" placeholder="0.1" required /></label><label>투자 원금(원)<input name="principal" type="number" min="0" step="1" placeholder="선택 입력" /></label></div>
      {assetType==="코인"&&<p className="form-hint">심볼은 자동으로 BTC-KRW 같은 원화 시세 페어로 저장됩니다.</p>}
      <button className="primary-button full" disabled={saving}>{saving?"등록 중…":"자산 등록"}</button>
    </form>
  </div></div>;
}

function DebtModal({ onClose, onSave }: { onClose:()=>void; onSave:(payload:DebtCreatePayload)=>Promise<void> }) {
  const [saving,setSaving] = useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await onSave({
        owner:String(form.get("owner")), debt_type:String(form.get("debt_type")),
        provider:String(form.get("provider")), name:String(form.get("name")),
        principal:Number(form.get("principal")) || 0, balance:Number(form.get("balance")),
        interest_rate:Number(form.get("interest_rate")) || 0,
      });
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal debt-modal" onMouseDown={(event)=>event.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">직접 등록</span><h2>부동산 부채 추가</h2></div><button onClick={onClose} aria-label="닫기">×</button></div>
    <form onSubmit={submit}>
      <div className="form-row"><label>대출 종류<select name="debt_type" defaultValue="주택담보대출"><option>주택담보대출</option><option>전세자금대출</option><option>중도금대출</option><option>기타 부동산 대출</option></select></label><label>소유자<select name="owner" defaultValue="성근"><option>성근</option><option>지우</option><option>윤재</option><option>공통</option></select></label></div>
      <label>대출 이름<input name="name" placeholder="예: 아파트 주택담보대출" required autoFocus /></label>
      <label>금융사<input name="provider" placeholder="예: 국민은행" /></label>
      <div className="form-row"><label>현재 잔액(원)<input name="balance" type="number" min="1" step="1" placeholder="320000000" required /></label><label>최초 대출금(원)<input name="principal" type="number" min="0" step="1" placeholder="선택 입력" /></label></div>
      <label>금리(연 %)<input name="interest_rate" type="number" min="0" max="100" step="0.01" placeholder="3.80" /></label>
      <p className="form-hint">직접 등록한 부채는 뱅크샐러드 파일을 다시 올려도 유지됩니다.</p>
      <button className="primary-button full" disabled={saving}>{saving?"등록 중…":"부채 등록"}</button>
    </form>
  </div></div>;
}

function EventModal({ initialDate, onClose, onSave }: { initialDate:string; onClose: () => void; onSave: (event: CalendarEvent) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await onSave({ id: crypto.randomUUID(), title: String(form.get("title")), date: String(form.get("date")), time: String(form.get("time")), owner: String(form.get("owner")) as CalendarEvent["owner"], color: String(form.get("color")) });
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e)=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Family Calendar</span><h2>가족 일정 추가</h2></div><button onClick={onClose} aria-label="닫기">×</button></div><form onSubmit={submit}><label>일정 이름<input name="title" placeholder="예: 가족 저녁" required autoFocus /></label><div className="form-row"><label>날짜<input name="date" type="date" defaultValue={initialDate} required /></label><label>시간<input name="time" type="time" /></label></div><div className="form-row"><label>공유 대상<select name="owner" defaultValue="공통"><option>공통</option><option>성근</option><option>지우</option><option>윤재</option></select></label><label>표시 색상<select name="color" defaultValue="mint"><option value="mint">초록</option><option value="blue">파랑</option><option value="pink">분홍</option><option value="amber">주황</option><option value="violet">보라</option></select></label></div><p className="form-hint">Google Calendar가 연결되어 있으면 저장과 동시에 공유 캘린더에도 추가됩니다.</p><button className="primary-button full" disabled={saving}>{saving?"저장 중...":"일정 저장"}</button></form></div></div>;
}

export default function Home() {
  const [tab, setTab] = useState<TabId>("summary");
  const [hidden, setHidden] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [portfolio, setPortfolio] = useState<Portfolio>(initialPortfolio);
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [gowalterPrompt, setGowalterPrompt] = useState<GowalterPrompt | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modal, setModal] = useState(false);
  const [eventDate,setEventDate] = useState(new Date().toISOString().slice(0,10));
  const [calendarStatus,setCalendarStatus] = useState<CalendarConnectionStatus|null>(null);
  const [stockOwnerFilter,setStockOwnerFilter] = useState("전체");
  const [deletingEventId,setDeletingEventId] = useState("");
  const [assetModalType,setAssetModalType] = useState<HoldingCreatePayload["asset_type"]|null>(null);
  const [debtModal,setDebtModal] = useState(false);
  const [quickAddModal,setQuickAddModal] = useState(false);
  const [hiddenAssetKeys,setHiddenAssetKeys] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [protectedMode, setProtectedMode] = useState(false);
  const [locked, setLocked] = useState(true);
  const [accessKey, setAccessKey] = useState("");
  const [loginOwner,setLoginOwner] = useState<"성근"|"지우"|"윤재">("성근");
  const [busy, setBusy] = useState("");
  const [reportItem,setReportItem] = useState<HoldingData|null>(null);
  const [stockReport,setStockReport] = useState<StockReport|null>(null);
  const [reportLoading,setReportLoading] = useState(false);
  const [reportError,setReportError] = useState("");

  useEffect(() => {
    void loadState(sessionStorage.getItem("family-key") || "");
    const savedHidden = localStorage.getItem("moa-hidden-assets");
    if (savedHidden) {
      try {
        const parsed = JSON.parse(savedHidden) as string[];
        window.setTimeout(()=>setHiddenAssetKeys(parsed),0);
      } catch { localStorage.removeItem("moa-hidden-assets"); }
    }
    // 첫 진입에서 서버 보호 여부와 저장된 데이터를 한 번만 확인합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 로그인 키 확인은 첫 진입에서 한 번만 실행합니다.
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeTitle = useMemo(() => navItems.find((item)=>item.id===tab)?.label, [tab]);

  async function migrateStoredEvents(key:string, state:ServerState) {
    const saved = localStorage.getItem("moa-calendar-events");
    if (!saved || state.viewer.role !== "admin") return state.events;
    try {
      const localEvents = JSON.parse(saved) as CalendarEvent[];
      const merged = [...state.events];
      for (const event of localEvents) {
        if (merged.some((item)=>item.id===event.id)) continue;
        const response = await fetch("/backend/events",{method:"POST",headers:{"content-type":"application/json","x-app-key":key},body:JSON.stringify(event)});
        const result = await response.json().catch(()=>({}));
        if (!response.ok || !result.event) throw new Error(result.detail||"기존 일정 이전 실패");
        merged.push(result.event as CalendarEvent);
      }
      localStorage.removeItem("moa-calendar-events");
      return merged.sort((a,b)=>a.date.localeCompare(b.date));
    } catch {
      return state.events;
    }
  }

  async function loadState(key: string) {
    try {
      const response = await fetch("/backend/state", { headers: { "x-app-key": key }, cache: "no-store" });
      if (response.status === 401) {
        sessionStorage.removeItem("family-key");
        setLocked(true);
        return false;
      }
      if (!response.ok) return false;
      const data = await response.json() as ServerState;
      const sharedEvents = await migrateStoredEvents(key,data);
      setServerState(data);
      setEvents(sharedEvents);
      setTransactions(data.transactions.map((item)=>({id:item.id,date:item.date,merchant:item.merchant,category:item.category,amount:item.amount,kind:item.type==="수입"?"income":"expense",owner:item.owner})));
      const summary = data.summary;
      const known = summary.real_estate_value + summary.investment_value + summary.cash_value;
      setPortfolio({
        source: "SQLite 누적",
        asOf: data.updated_at.slice(0,10),
        owner: "성근",
        totalAssets: summary.total_assets,
        totalDebts: summary.total_debts,
        netWorth: summary.net_assets,
        cash: summary.cash_value,
        investments: summary.investment_value,
        realEstate: summary.real_estate_value,
        movable: 0,
        other: Math.max(0,summary.total_assets-known),
      });
      setProtectedMode(Boolean(data.protected));
      setLocked(false);
      if (key) sessionStorage.setItem("family-key", key);
      void loadGowalterPrompt(key);
      return true;
    } catch {
      return false;
    }
  }

  function authHeaders(json = false) {
    const headers: Record<string,string> = { "x-app-key": sessionStorage.getItem("family-key") || "" };
    if (json) headers["content-type"] = "application/json";
    return headers;
  }

  async function login() {
    const response = await fetch("/backend/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({owner:loginOwner,password:accessKey})});
    const result = await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.detail||"로그인하지 못했습니다.");
    sessionStorage.setItem("family-key",result.token);
    const loaded = await loadState(result.token);
    if(!loaded)throw new Error("로그인 정보를 확인하지 못했습니다.");
    setAccessKey("");
  }

  function logout() {
    sessionStorage.removeItem("family-key");
    setServerState(null);
    setTab("summary");
    setLocked(true);
  }

  async function loadGowalterPrompt(key: string) {
    try {
      const response = await fetch("/backend/ai/prompt",{headers:{"x-app-key":key},cache:"no-store"});
      if(response.ok)setGowalterPrompt(await response.json() as GowalterPrompt);
    } catch {
      // 기본 AI 분석은 프롬프트 미리보기가 없어도 계속 사용할 수 있습니다.
    }
  }

  async function importFile(input: FileList | File | null, owner = "성근") {
    const file = input instanceof File ? input : input?.[0];
    if (!file) return;
    setBusy("import");
    try {
      const form = new FormData();
      form.append("file",file);
      const response = await fetch(`/backend/import?owner=${encodeURIComponent(owner)}`,{method:"POST",headers:authHeaders(),body:form});
      const result = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.detail||"업로드 실패");
      await loadState(sessionStorage.getItem("family-key")||"");
      setImportStatus({label:file.name,importedAt:new Date().toISOString(),transactionCount:result.transactions_read||0,holdingCount:result.holdings_updated||0});
      setToast(`가계부 ${result.transactions_added}건 추가 · 투자상품 ${result.holdings_updated}개 갱신`);
    } catch (error) {
      setToast(error instanceof Error?error.message:"파일을 처리하지 못했어요.");
    } finally {
      setBusy("");
    }
  }

  async function importStocks(files: FileList | null, owner: string) {
    await importFile(files,owner);
  }

  async function refreshMarket() {
    setBusy("market");
    try {
      const response=await fetch("/backend/market/refresh",{method:"POST",headers:authHeaders()});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.detail||"갱신 실패");
      await loadState(sessionStorage.getItem("family-key")||"");
      setToast(`현재가 ${result.updated}개 갱신 · 티커 ${result.tickers_resolved}개 확인`);
    } catch(error){setToast(error instanceof Error?error.message:"현재가를 갱신하지 못했어요.");} finally{setBusy("");}
  }

  async function runAnalysis(prompt = "") {
    setBusy("ai");
    try {
      const response=await fetch("/backend/ai/analyze",{method:"POST",headers:authHeaders(true),body:JSON.stringify({prompt})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.detail||"분석 실패");
      await loadState(sessionStorage.getItem("family-key")||"");
      setToast(`${result.provider==="openai"?"OpenAI":"로컬"} 분석을 누적 저장했어요.`);
    } catch(error){setToast(error instanceof Error?error.message:"AI 분석을 만들지 못했어요.");} finally{setBusy("");}
  }

  async function saveHolding(id:number,data:Partial<HoldingData>) {
    setBusy("holding");
    try {
      const response=await fetch(`/backend/holdings/${id}`,{method:"PATCH",headers:authHeaders(true),body:JSON.stringify(data)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.detail||"저장 실패");
      await loadState(sessionStorage.getItem("family-key")||"");
      setToast("티커와 목표가를 저장했어요.");
    } catch(error){setToast(error instanceof Error?error.message:"종목 설정을 저장하지 못했어요.");} finally{setBusy("");}
  }

  function toggleAssetHidden(key:string,label:string) {
    const next = hiddenAssetKeys.includes(key) ? hiddenAssetKeys.filter((item)=>item!==key) : [...hiddenAssetKeys,key];
    setHiddenAssetKeys(next);
    localStorage.setItem("moa-hidden-assets",JSON.stringify(next));
    setToast(`${label} ${next.includes(key)?"숨김":"표시"} 처리했어요.`);
  }

  function openAssetModal(type:HoldingCreatePayload["asset_type"]) {
    setAssetModalType(type);
  }

  async function createAsset(payload:HoldingCreatePayload) {
    setBusy("asset");
    try {
      const response = await fetch("/backend/holdings",{method:"POST",headers:authHeaders(true),body:JSON.stringify(payload)});
      const result = await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.detail||"자산을 등록하지 못했습니다.");
      await loadState(sessionStorage.getItem("family-key")||"");
      setAssetModalType(null);
      setToast(result.quote_updated?"자산을 등록하고 원화 시세를 반영했어요.":"자산을 등록했어요. 시세 갱신을 다시 눌러 주세요.");
    } catch(error) {
      setToast(error instanceof Error?error.message:"자산을 등록하지 못했습니다.");
      throw error;
    } finally { setBusy(""); }
  }

  async function createDebt(payload:DebtCreatePayload) {
    setBusy("debt");
    try {
      const response = await fetch("/backend/debts",{method:"POST",headers:authHeaders(true),body:JSON.stringify(payload)});
      const result = await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.detail||"부채를 등록하지 못했습니다.");
      await loadState(sessionStorage.getItem("family-key")||"");
      setDebtModal(false);
      setToast("부채를 등록하고 순자산에 반영했어요.");
    } catch(error) {
      setToast(error instanceof Error?error.message:"부채를 등록하지 못했습니다.");
      throw error;
    } finally { setBusy(""); }
  }

  async function openStockReport(item:HoldingData) {
    setReportItem(item);
    setStockReport(null);
    setReportError("");
    setReportLoading(true);
    try {
      const response=await fetch(`/backend/holdings/${item.id}/report`,{headers:authHeaders(),cache:"no-store"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.detail||"종목 리포트를 불러오지 못했습니다.");
      setStockReport(result as StockReport);
    } catch(error) {
      setReportError(error instanceof Error?error.message:"종목 리포트를 불러오지 못했습니다.");
    } finally {
      setReportLoading(false);
    }
  }

  async function probeIntegrations() {
    setBusy("probe");
    try {
      const response=await fetch("/backend/integrations/status?probe=true",{headers:authHeaders()});
      const result=await response.json();
      if(response.ok)setServerState((current)=>current?{...current,integrations:result}:current);
      setToast("외부 연동 상태를 실제로 확인했어요.");
    } catch{setToast("연동 상태를 확인하지 못했어요.");} finally{setBusy("");}
  }

  async function addEvent(event: CalendarEvent) {
    const response = await fetch("/api/calendar", { method:"POST", headers:{"content-type":"application/json","x-app-key":sessionStorage.getItem("family-key")||""}, body:JSON.stringify(event) }).catch(()=>null);
    const result = response?.ok ? await response.json().catch(()=>null) as { configured?:boolean; event?:{ id?:string } }|null : null;
    const savedEvent = result?.event?.id ? {...event,googleEventId:result.event.id} : event;
    const backendResponse = await fetch("/backend/events",{method:"POST",headers:authHeaders(true),body:JSON.stringify(savedEvent)});
    const backendResult = await backendResponse.json().catch(()=>({}));
    if(!backendResponse.ok || !backendResult.event) {
      localStorage.setItem("moa-calendar-events",JSON.stringify([...events,savedEvent]));
      throw new Error(backendResult.detail||"일정을 공용 저장소에 저장하지 못했습니다.");
    }
    setEvents((current)=>[...current,backendResult.event as CalendarEvent].sort((a,b)=>a.date.localeCompare(b.date)));
    setModal(false);
    setToast(result?.configured ? "공유 Google 캘린더에 추가했어요." : "일정을 앱에만 저장했어요. Google 연동 후 새로 등록하면 함께 저장됩니다.");
  }

  async function deleteEvent(event:CalendarEvent) {
    if (!window.confirm(`‘${event.title}’ 일정을 삭제할까요?${event.googleEventId?" Google Calendar에서도 함께 삭제됩니다.":""}`)) return;
    setDeletingEventId(event.id);
    try {
      if (event.googleEventId) {
        const response = await fetch("/api/calendar",{method:"DELETE",headers:authHeaders(true),body:JSON.stringify({eventId:event.googleEventId})});
        const result = await response.json().catch(()=>({}));
        if(!response.ok || !result.deleted)throw new Error(result.error||"Google Calendar에서 일정을 삭제하지 못했습니다.");
      }
      const backendResponse = await fetch(`/backend/events/${encodeURIComponent(event.id)}`,{method:"DELETE",headers:authHeaders()});
      const backendResult = await backendResponse.json().catch(()=>({}));
      if(!backendResponse.ok || !backendResult.deleted)throw new Error(backendResult.detail||"공용 일정에서 삭제하지 못했습니다.");
      setEvents((current)=>current.filter((item)=>item.id!==event.id));
      setToast(event.googleEventId?"앱과 Google Calendar에서 일정을 삭제했어요.":"앱에서 일정을 삭제했어요.");
    } catch(error) {
      setToast(error instanceof Error?error.message:"일정을 삭제하지 못했습니다.");
    } finally { setDeletingEventId(""); }
  }

  async function checkCalendar() {
    setBusy("calendar");
    try {
      const response = await fetch("/api/calendar",{headers:authHeaders(),cache:"no-store"});
      const result = await response.json().catch(()=>({message:"연결 상태를 읽지 못했습니다."})) as CalendarConnectionStatus;
      if(!response.ok)throw new Error(result.message||"연결 확인 실패");
      setCalendarStatus(result);
      setToast(result.connected?"Google Calendar 연결을 확인했어요.":result.message);
    } catch(error) {
      const message = error instanceof Error?error.message:"Google Calendar 연결 확인 실패";
      setCalendarStatus({configured:false,connected:false,message});
      setToast(message);
    } finally { setBusy(""); }
  }

  function openEventModal(date = new Date().toISOString().slice(0,10)) {
    setEventDate(date);
    setModal(true);
  }

  function openQuickAdd() {
    if (tab === "stocks") return openAssetModal("주식");
    if (tab === "crypto") return openAssetModal("코인");
    if (tab === "realestate") return setDebtModal(true);
    if (tab === "calendar") return openEventModal();
    setQuickAddModal(true);
  }

  if (locked) {
    return <main className="lock-screen"><div className="lock-card"><span className="brand-mark"><i/><i/><i/></span><span className="eyebrow">Private family app</span><h1>우리 가족만의 공간</h1><p>내 계정을 선택하고 가족 비밀번호로 로그인해 주세요.</p><form onSubmit={async (event)=>{event.preventDefault();try{await login()}catch(error){setToast(error instanceof Error?error.message:"로그인하지 못했습니다.")}}}><label className="login-label">계정<select value={loginOwner} onChange={(event)=>setLoginOwner(event.target.value as typeof loginOwner)}><option>성근</option><option>지우</option><option>윤재</option></select></label><label className="login-label">비밀번호<input type="password" value={accessKey} onChange={(event)=>setAccessKey(event.target.value)} placeholder="비밀번호" autoComplete="current-password" required/></label><button className="primary-button full">로그인</button></form><small className="login-role-note">성근 · 관리자 / 지우·윤재 · 본인 자산 조회</small></div>{toast && <div className="toast" role="status">{toast}</div>}</main>;
  }

  const allHoldings = serverState?.holdings||[];
  const cryptoHoldings = allHoldings.filter(isCryptoHolding);
  const stockHoldings = allHoldings.filter((item)=>!isCryptoHolding(item));
  const hiddenRealEstate = hiddenAssetKeys.includes("category:realestate");
  const viewer = serverState?.viewer||{owner:"성근" as const,role:"admin" as const};
  const isAdmin = viewer.role==="admin";
  const displayedStockHoldings = isAdmin && stockOwnerFilter!=="전체" ? stockHoldings.filter((item)=>item.owner===stockOwnerFilter) : stockHoldings;
  const visibleNavItems = isAdmin ? navItems : navItems.filter((item)=>["summary","stocks","crypto","realestate","calendar"].includes(item.id));
  const visibleEvents = isAdmin ? events : events.filter((event)=>event.owner===viewer.owner);
  const bottomItems = isAdmin ? [{id:"summary",label:"홈",icon:"home"},{id:"stocks",label:"자산",icon:"chart"},{id:"ledger",label:"가계부",icon:"wallet"},{id:"calendar",label:"일정",icon:"calendar"},{id:"settings",label:"설정",icon:"settings"}] : [{id:"summary",label:"홈",icon:"home"},{id:"stocks",label:"자산",icon:"chart"},{id:"calendar",label:"일정",icon:"calendar"}];

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={()=>setTab("summary")} aria-label="모아 홈"><span className="brand-mark"><i/><i/><i/></span><span><b>모아</b><small>우리 가족의 자산</small></span></button>
        <div className="top-actions"><span className={`role-badge ${viewer.role}`}>{viewer.role==="admin"?"관리자":"게스트"}</span><button onClick={()=>setHidden(!hidden)} aria-label={hidden?"금액 표시":"금액 숨기기"}><Icon name={hidden?"eyeOff":"eye"} /></button><button className="avatar-button" onClick={logout} title="로그아웃">{viewer.owner.slice(0,1)}</button></div>
      </header>

      <nav className="top-nav" aria-label="전체 메뉴">{visibleNavItems.map((item)=><button key={item.id} className={tab===item.id?"active":""} onClick={()=>setTab(item.id)}>{item.label}</button>)}</nav>

      <div className="content">
        {tab === "summary" && <Summary hidden={hidden} hiddenRealEstate={hiddenRealEstate} readOnly={!isAdmin} setTab={setTab} portfolio={portfolio} transactions={transactions} onImport={importFile} importStatus={importStatus} importing={busy==="import"} />}
        {tab === "family" && <Family hidden={hidden} portfolio={portfolio} members={serverState?.members||{}} />}
        {tab === "stocks" && <Stocks hidden={hidden} readOnly={!isAdmin} ownerFilter={stockOwnerFilter} onOwnerFilter={setStockOwnerFilter} holdings={displayedStockHoldings} hiddenAssetKeys={hiddenAssetKeys} exchangeRate={serverState?.exchange_rate||null} analysis={serverState?.latest_analysis||null} promptData={gowalterPrompt} busy={busy} onImport={importStocks} onRefresh={refreshMarket} onAnalyze={runAnalysis} onSave={saveHolding} onOpenReport={openStockReport} onToggleAssetHidden={toggleAssetHidden} onAdd={()=>openAssetModal("주식")} />}
        {tab === "ledger" && <Ledger hidden={hidden} transactions={transactions} onImport={importFile} />}
        {tab === "crypto" && <Crypto hidden={hidden} readOnly={!isAdmin} holdings={cryptoHoldings} hiddenAssetKeys={hiddenAssetKeys} busy={busy} onRefresh={refreshMarket} onAdd={()=>openAssetModal("코인")} onToggleAssetHidden={toggleAssetHidden} onSave={saveHolding} onOpenReport={openStockReport} />}
        {tab === "realestate" && <RealEstate hidden={hidden} readOnly={!isAdmin} assetHidden={hiddenRealEstate} onToggleHidden={()=>toggleAssetHidden("category:realestate","부동산")} onAddDebt={()=>setDebtModal(true)} portfolio={portfolio} debts={serverState?.debts||[]} />}
        {tab === "calendar" && <CalendarScreen events={visibleEvents} readOnly={!isAdmin} status={calendarStatus} checking={busy==="calendar"} deletingId={deletingEventId} onCheck={()=>void checkCalendar()} onAdd={openEventModal} onDelete={(event)=>void deleteEvent(event)} />}
        {tab === "settings" && <Settings protectedMode={protectedMode} integrations={serverState?.integrations||{}} busy={busy} onProbe={probeIntegrations} />}
      </div>

      {isAdmin&&<button className="fab" aria-label="빠른 추가" onClick={openQuickAdd}><Icon name="plus" /></button>}
      <nav className="bottom-nav" aria-label="주요 메뉴" style={{gridTemplateColumns:`repeat(${bottomItems.length},1fr)`}}>
        {bottomItems.map((item)=><button key={item.id} className={tab===item.id || (item.id==="stocks" && ["family","crypto","realestate"].includes(tab))?"active":""} onClick={()=>setTab(item.id as TabId)}><Icon name={item.icon}/><small>{item.label}</small></button>)}
      </nav>
      <div className="sr-only" aria-live="polite">현재 화면: {activeTitle}</div>
      {toast && <div className="toast" role="status">{toast}</div>}
      {modal && <EventModal initialDate={eventDate} onClose={()=>setModal(false)} onSave={addEvent} />}
      {quickAddModal&&<QuickAddModal onClose={()=>setQuickAddModal(false)} onStock={()=>openAssetModal("주식")} onCrypto={()=>openAssetModal("코인")} onDebt={()=>setDebtModal(true)} onCalendar={()=>openEventModal()} onLedger={()=>setTab("ledger")}/>}
      {assetModalType&&<AssetModal initialType={assetModalType} onClose={()=>setAssetModalType(null)} onSave={createAsset}/>}
      {debtModal&&<DebtModal onClose={()=>setDebtModal(false)} onSave={createDebt}/>}
      {reportItem&&<StockReportModal item={reportItem} report={stockReport} loading={reportLoading} error={reportError} onClose={()=>{setReportItem(null);setStockReport(null);setReportError("")}}/>}
    </main>
  );
}
