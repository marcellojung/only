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
  owner: "성근" | "지은" | "공통";
};

type Portfolio = {
  source: string;
  asOf: string;
  owner: "성근" | "지은" | "공통";
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

type ServerState = {
  protected: boolean;
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
    owner: "성근" | "지은" | "공통";
  }>;
  holdings: HoldingData[];
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
  owner: "공통" | "성근" | "지은";
  color?: string;
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
  { id: "1", date: "2026-08-03", merchant: "마켓컬리", category: "식비", amount: 68400, kind: "expense", owner: "지은" },
  { id: "2", date: "2026-08-02", merchant: "현대오일뱅크", category: "교통", amount: 76000, kind: "expense", owner: "성근" },
  { id: "3", date: "2026-08-01", merchant: "넷플릭스", category: "구독", amount: 17000, kind: "expense", owner: "성근" },
  { id: "4", date: "2026-07-31", merchant: "교보문고", category: "생활", amount: 28900, kind: "expense", owner: "지은" },
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

const sampleEvents: CalendarEvent[] = [
  { id: "e1", title: "아파트 관리비", date: "2026-08-05", time: "자동이체", owner: "공통", color: "mint" },
  { id: "e2", title: "지은 치과", date: "2026-08-08", time: "11:30", owner: "지은", color: "pink" },
  { id: "e3", title: "포트폴리오 점검", date: "2026-08-12", time: "20:00", owner: "공통", color: "violet" },
  { id: "e4", title: "부모님 저녁", date: "2026-08-16", time: "18:00", owner: "공통", color: "amber" },
  { id: "e5", title: "성근 건강검진", date: "2026-08-21", time: "09:00", owner: "성근", color: "blue" },
];

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

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    home: "⌂",
    chart: "↗",
    wallet: "₩",
    calendar: "□",
    settings: "⚙",
    eye: "◉",
    plus: "+",
    lock: "●",
  };
  return <span aria-hidden="true">{icons[name] ?? "•"}</span>;
}

function Amount({ children, hidden }: { children: ReactNode; hidden: boolean }) {
  return <>{hidden ? <span className="blurred">{children}</span> : children}</>;
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

function Summary({ hidden, setTab, portfolio, transactions, onImport, importStatus, importing }: { hidden: boolean; setTab: (tab: TabId) => void; portfolio: Portfolio; transactions: Transaction[]; onImport: (files: FileList | null, owner?: string) => void; importStatus: ImportStatus | null; importing: boolean }) {
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
      <div className="upload-row bank-upload"><select className="owner-select" aria-label="업로드 소유자" value={importOwner} onChange={(event)=>setImportOwner(event.target.value)}><option>성근</option><option>지은</option><option>공통</option></select><button className="primary-button" disabled={importing} onClick={()=>inputRef.current?.click()}>{importing ? "파일 반영 중…" : "＋ 뱅크샐러드 통합 파일 불러오기"}</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xlsm" onChange={(event)=>{ onImport(event.target.files,importOwner); event.target.value = ""; }} /><span>같은 내역은 제외하고 자산 이력은 누적해요</span></div>
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
        <button className="text-button" onClick={() => setTab("family")}>가족별 보기 →</button>
      </div>

      <div className="metric-grid">
        <article className="metric-card peach"><span className="metric-icon">↗</span><p>투자 자산</p><strong><Amount hidden={hidden}>{compactMoney(portfolio.investments)}</Amount></strong><small>주식 · ETF · 펀드</small></article>
        <article className="metric-card blue"><span className="metric-icon">⌂</span><p>부동산</p><strong><Amount hidden={hidden}>{compactMoney(portfolio.realEstate)}</Amount></strong><small>뱅크샐러드 평가금액</small></article>
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

function Family({ hidden, portfolio }: { hidden: boolean; portfolio: Portfolio }) {
  const sungkeun = portfolio.owner === "성근" ? portfolio.totalAssets : 0;
  const jieun = portfolio.owner === "지은" ? portfolio.totalAssets : 0;
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="가족별" title="둘이 모은 자산" copy="각자의 자산과 공동 자산을 한 화면에서 확인해요." />
      <article className="panel family-share">
        <div className="panel-head"><div><span className="eyebrow">전체 자산 비중</span><h2>함께 만드는 포트폴리오</h2></div></div>
        <div className="donut family-donut" style={{background:`conic-gradient(#7895b6 0 ${percentage(sungkeun, portfolio.totalAssets)}%,#d38a90 ${percentage(sungkeun, portfolio.totalAssets)}% 100%)`}}><div><small>총 자산</small><strong><Amount hidden={hidden}>{compactMoney(portfolio.totalAssets)}</Amount></strong></div></div>
        <div className="member-list">
          <div><span className="avatar man">성</span><p><b>성근</b><small><Amount hidden={hidden}>{compactMoney(sungkeun)}</Amount></small></p><strong>{percentage(sungkeun, portfolio.totalAssets).toFixed(1)}%</strong></div>
          <div><span className="avatar woman">지</span><p><b>지은</b><small><Amount hidden={hidden}>{compactMoney(jieun)}</Amount></small></p><strong>{percentage(jieun, portfolio.totalAssets).toFixed(1)}%</strong></div>
        </div>
      </article>
      <div className="member-cards">
        <article className="member-card"><div className="avatar man">성</div><span className="eyebrow">성근 자산</span><h2><Amount hidden={hidden}>{compactMoney(sungkeun)}</Amount></h2><div className="mini-bars"><i style={{width:`${percentage(portfolio.realEstate, portfolio.totalAssets)}%`}} /><i style={{width:`${percentage(portfolio.investments, portfolio.totalAssets)}%`}} /><i style={{width:`${percentage(portfolio.cash, portfolio.totalAssets)}%`}} /></div><small>{portfolio.owner === "성근" ? "이번 뱅크샐러드 파일 기준" : "업로드 자료 없음"}</small></article>
        <article className="member-card"><div className="avatar woman">지</div><span className="eyebrow">지은 자산</span><h2><Amount hidden={hidden}>{compactMoney(jieun)}</Amount></h2><div className="mini-bars pink-bars"><i style={{width:"0%"}} /><i style={{width:"0%"}} /><i style={{width:"0%"}} /></div><small>{portfolio.owner === "지은" ? "이번 뱅크샐러드 파일 기준" : "지은 님 파일을 추가로 업로드해 주세요"}</small></article>
      </div>
    </section>
  );
}

function HoldingCard({ item, hidden, onSave }: { item: HoldingData; hidden: boolean; onSave: (id: number, data: Partial<HoldingData>)=>Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [ticker, setTicker] = useState(item.ticker);
  const [target, setTarget] = useState(item.target_price ? String(item.target_price) : "");
  const estimated = item.quantity_source === "estimated_from_import_value";
  return <article className="holding-card">
    <button className="holding-main" onClick={()=>setEditing(!editing)}>
      <span className="asset-logo">{item.name.slice(0,1)}</span>
      <div><b>{item.name}</b><small>{item.broker} · {item.ticker || "티커 확인 전"} · {item.owner}</small></div>
      <div className="row-value"><strong><Amount hidden={hidden}>{compactMoney(item.market_value)}</Amount></strong><small className={item.return_rate<0?"negative":"positive"}>{item.return_rate>=0?"+":""}{(item.return_rate*100).toFixed(1)}%</small></div>
    </button>
    {editing && <form className="holding-editor" onSubmit={async(event)=>{event.preventDefault();await onSave(item.id,{ticker,target_price:Number(target)||0,target_alert_enabled:true});setEditing(false)}}>
      <label>티커<input value={ticker} onChange={(event)=>setTicker(event.target.value)} placeholder="005930.KS / AAPL"/></label>
      <label>목표가 ({item.currency})<input type="number" min="0" step="any" value={target} onChange={(event)=>setTarget(event.target.value)} placeholder="목표가"/></label>
      <button className="primary-button small">저장</button>
      <small>{estimated ? "수량은 최초 평가액과 현재가로 추정됨" : item.quantity ? `${money(item.quantity)}주` : "현재가 갱신 시 수량을 자동 추정"} · 목표 도달 시 Telegram 알림</small>
    </form>}
  </article>;
}

function Stocks({ hidden, holdings, summary, exchangeRate, analysis, busy, onImport, onRefresh, onAnalyze, onSave }: { hidden: boolean; holdings: HoldingData[]; summary?: AssetSummary; exchangeRate: ServerState["exchange_rate"] | null; analysis: ServerState["latest_analysis"]; busy: string; onImport:(files:FileList|null)=>void; onRefresh:()=>void; onAnalyze:()=>void; onSave:(id:number,data:Partial<HoldingData>)=>Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const principal = summary?.investment_principal || holdings.reduce((sum,item)=>sum+item.principal,0);
  const value = summary?.investment_value || holdings.reduce((sum,item)=>sum+item.market_value,0);
  const pnl = value-principal;
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="주식 / ETF" title="꾸준히, 멀리 보기" copy="뱅크샐러드 종목을 현재 시세와 목표가 알림까지 연결해요." />
      <div className="upload-row stock-upload"><button className="primary-button" disabled={Boolean(busy)} onClick={()=>inputRef.current?.click()}>{busy==="import"?"파일 반영 중…":"＋ 뱅크샐러드·종목 파일"}</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xlsm,.csv" onChange={(event)=>{onImport(event.target.files);event.target.value=""}}/><span>같은 내역은 자동 중복 제외</span></div>
      <article className="investment-hero stock-hero"><span>투자 원금 {compactMoney(principal)}</span><h2><Amount hidden={hidden}>{compactMoney(value)}</Amount></h2><strong className={pnl<0?"negative":""}>{pnl>=0?"+":""}{compactMoney(pnl)} ({principal?(pnl/principal*100).toFixed(1):0}%)</strong><div className="spark-bars">{[30,42,36,49,55,51,68,73,69,81,88,96].map((v,i)=><i key={i} style={{height:`${v}%`}} />)}</div></article>
      <div className="market-actions"><div><span className="eyebrow">환율</span><b>{exchangeRate?.rate?`1 USD = ${money(exchangeRate.rate)}원`:"갱신 전"}</b></div><button className="primary-button" disabled={Boolean(busy)} onClick={onRefresh}>{busy==="market"?"갱신 중…":"↻ 환율·현재가 갱신"}</button><button className="filter-button" disabled={Boolean(busy)} onClick={onAnalyze}>{busy==="ai"?"분석 중…":"AI 분석"}</button></div>
      {analysis&&<article className="panel ai-panel"><div className="panel-head"><div><span className="eyebrow">{analysis.provider} · {analysis.model}</span><h2>최근 AI 분석</h2></div></div><pre>{analysis.text}</pre></article>}
      <div className="section-title-row"><div><span className="eyebrow">보유 종목 {holdings.length}개</span><h2>내 포트폴리오</h2></div><span className="chip">평가액순</span></div>
      <div className="holding-list">{holdings.length?holdings.map((item)=><HoldingCard key={item.id} item={item} hidden={hidden} onSave={onSave}/>):<article className="empty-card">뱅크샐러드 파일을 올리면 투자상품이 여기에 표시됩니다.</article>}</div>
    </section>
  );
}

function Crypto({ hidden }: { hidden: boolean }) {
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="암호화폐" title="아직 연결된 자산이 없어요" copy="이번 뱅크샐러드 파일에는 암호화폐 평가내역이 포함되지 않았습니다." />
      <article className="investment-hero crypto-hero"><span>암호화폐 평가금액</span><h2><Amount hidden={hidden}>0원</Amount></h2><strong>별도 거래소 내역을 준비해 주세요</strong><div className="crypto-rings"><i /><i /><i /></div></article>
      <article className="panel risk-card"><div><span className="eyebrow">데이터 상태</span><h2>미연결</h2><p>지원 양식을 추가하면 이 탭도 실제 값으로 바뀝니다.</p></div><div className="gauge"><i style={{width:"0%"}} /></div></article>
    </section>
  );
}

function RealEstate({ hidden, portfolio }: { hidden: boolean; portfolio: Portfolio }) {
  const equity = Math.max(0, portfolio.realEstate - portfolio.totalDebts);
  const debtRatio = percentage(portfolio.totalDebts, portfolio.realEstate);
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="부동산" title="우리 집의 오늘 가치" copy="매입가, 현재 시세와 대출을 함께 관리해요." />
      <article className="property-card"><div className="property-visual"><span>REAL ESTATE</span><div className="building"><i/><i/><i/><i/><i/><i/></div></div><div className="property-content"><span className="status-pill">뱅크샐러드</span><h2>등록 부동산</h2><p>{portfolio.asOf || "업데이트 전"} 평가 기준</p><div className="property-price"><span>현재 평가금액</span><strong><Amount hidden={hidden}>{compactMoney(portfolio.realEstate)}</Amount></strong><small>원본 파일의 재무현황 합계</small></div></div></article>
      <div className="metric-grid property-metrics"><article className="metric-card"><p>총 부채</p><strong><Amount hidden={hidden}>{compactMoney(portfolio.totalDebts)}</Amount></strong><small>자산현황에 연결된 부채</small></article><article className="metric-card"><p>부동산 순가치</p><strong><Amount hidden={hidden}>{compactMoney(equity)}</Amount></strong><small>부채비율 {debtRatio.toFixed(1)}%</small></article></div>
      <article className="panel loan-panel"><div className="panel-head"><div><span className="eyebrow">부채 비율</span><h2>부동산 대비</h2></div><strong>{debtRatio.toFixed(1)}%</strong></div><div className="progress"><i style={{width:`${Math.min(debtRatio,100)}%`}} /></div><div className="loan-stats"><span>부동산 평가액 <b><Amount hidden={hidden}>{compactMoney(portfolio.realEstate)}</Amount></b></span><span>총 부채 <b><Amount hidden={hidden}>{compactMoney(portfolio.totalDebts)}</Amount></b></span></div></article>
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

function CalendarScreen({ events, onAdd }: { events: CalendarEvent[]; onAdd: () => void }) {
  const [cursor, setCursor] = useState(new Date(2026, 7, 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + days }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  const monthEvents = events.filter((event)=>event.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`));
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="Google Calendar" title="우리의 공동 일정" copy="서로 추가한 일정이 Google 캘린더와 함께 업데이트돼요." />
      <div className="calendar-toolbar"><button onClick={()=>setCursor(new Date(year,month-1,1))} aria-label="이전 달">‹</button><h2>{year}. {String(month+1).padStart(2,"0")}</h2><button onClick={()=>setCursor(new Date(year,month+1,1))} aria-label="다음 달">›</button><button className="today-button" onClick={()=>setCursor(new Date(2026,7,1))}>오늘</button></div>
      <article className="calendar-card"><div className="weekdays">{["일","월","화","수","목","금","토"].map((day)=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day,index)=>{
        const dateKey = day ? `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` : "";
        const event = monthEvents.find((item)=>item.date===dateKey);
        const isToday = year===2026 && month===7 && day===3;
        return <div className={`${day?"":"empty"} ${isToday?"today":""}`} key={index}>{day && <><span>{day}</span>{event && <i className={`event-dot ${event.color || "mint"}`} title={event.title}/>}</>}</div>
      })}</div></article>
      <div className="section-title-row"><div><span className="eyebrow">다가오는 일정</span><h2>이번 달</h2></div><button className="primary-button small" onClick={onAdd}>＋ 일정 추가</button></div>
      <div className="event-list">{monthEvents.map(event=><article key={event.id} className="event-row"><time><strong>{Number(event.date.slice(-2))}</strong><small>8월</small></time><i className={`event-line ${event.color || "mint"}`} /><div><b>{event.title}</b><small>{event.time || "종일"} · {event.owner}</small></div><span>›</span></article>)}</div>
      <a className="google-card" href="https://calendar.google.com" target="_blank" rel="noreferrer"><span className="google-mark">G</span><div><b>Google 캘린더에서 열기</b><small>공유 캘린더의 전체 일정을 확인하세요</small></div><span>↗</span></a>
    </section>
  );
}

const integrationLabels: Record<string,[string,string,string]> = {
  database:["S","SQLite 누적 저장","자산·가계부·분석·알림 이력"],
  bank_salad:["X","뱅크샐러드 업로드","가계부·자산 현황"],
  market:["↗","환율·현재가","Yahoo Finance / yfinance"],
  openai:["AI","AI 포트폴리오 분석","OpenAI 또는 로컬 분석"],
  telegram:["T","Telegram 목표가 알림","목표가 도달 알림"],
  google_calendar:["G","Google 캘린더","공유 일정 읽기 · 추가"],
};

function Settings({ protectedMode, integrations, busy, onProbe }: { protectedMode: boolean; integrations: IntegrationStatus; busy: string; onProbe:()=>void }) {
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="설정" title="우리 집 데이터 관리" copy="연동 상태와 보안 설정을 한곳에서 확인해요." />
      <article className="profile-panel"><div className="couple-avatars"><span className="avatar man">성</span><span className="avatar woman">지</span></div><div><b>성근 · 지은의 집</b><small>FastAPI + SQLite 비공개 자산 서버</small></div><span className="secure-badge">비공개</span></article>
      <div className="settings-group"><div className="settings-title"><h2>외부 연동 상태</h2><button className="text-button" disabled={Boolean(busy)} onClick={onProbe}>{busy==="probe"?"확인 중…":"실제 연결 확인"}</button></div>{Object.entries(integrations).map(([key,status])=>{const label=integrationLabels[key]||["·",key,""];return <button key={key}><span className={`settings-symbol ${key==="google_calendar"?"google":key==="bank_salad"?"excel":"server"}`}>{label[0]}</span><div><b>{label[1]}</b><small>{label[2]}{status.last_checked_at?` · ${status.last_checked_at.slice(0,16).replace("T"," ")}`:""}</small></div><em className={status.connected?"connected":""}>{status.message}</em></button>})}</div>
      <div className="settings-group"><h2>보안 및 저장</h2><button><span className="settings-symbol privacy">●</span><div><b>접근 보호</b><small>{protectedMode?"APP_ACCESS_KEY로 보호됨":"현재 로컬 모드"}</small></div><em className={protectedMode?"connected":""}>{protectedMode?"보호 중":"키 설정 권장"}</em></button><button><span className="settings-symbol server">DB</span><div><b>누적 데이터</b><small>업로드·시세·AI·알림 결과를 삭제 없이 기록</small></div><em className="connected">SQLite</em></button></div>
      <div className="privacy-note"><b>우리 둘만 볼 수 있어요</b><p>검색엔진에 노출하지 않고, 서버 접근 키와 HTTPS로 보호하도록 설계했습니다.</p></div>
    </section>
  );
}

function EventModal({ onClose, onSave }: { onClose: () => void; onSave: (event: CalendarEvent) => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    onSave({ id: crypto.randomUUID(), title: String(form.get("title")), date: String(form.get("date")), time: String(form.get("time")), owner: String(form.get("owner")) as CalendarEvent["owner"], color: "mint" });
    setSaving(false);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e)=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Google Calendar</span><h2>공동 일정 추가</h2></div><button onClick={onClose} aria-label="닫기">×</button></div><form onSubmit={submit}><label>일정 이름<input name="title" placeholder="예: 부모님 저녁" required /></label><div className="form-row"><label>날짜<input name="date" type="date" defaultValue="2026-08-16" required /></label><label>시간<input name="time" type="time" defaultValue="18:00" /></label></div><label>공유 대상<select name="owner" defaultValue="공통"><option>공통</option><option>성근</option><option>지은</option></select></label><button className="primary-button full" disabled={saving}>{saving?"저장 중...":"Google 캘린더에 추가"}</button></form></div></div>;
}

export default function Home() {
  const [tab, setTab] = useState<TabId>("summary");
  const [hidden, setHidden] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [portfolio, setPortfolio] = useState<Portfolio>(initialPortfolio);
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>(sampleEvents);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [protectedMode, setProtectedMode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void loadState(sessionStorage.getItem("family-key") || "");
    // 첫 진입에서 서버 보호 여부와 저장된 데이터를 한 번만 확인합니다.
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeTitle = useMemo(() => navItems.find((item)=>item.id===tab)?.label, [tab]);

  async function loadState(key: string) {
    try {
      const response = await fetch("/backend/state", { headers: { "x-app-key": key }, cache: "no-store" });
      if (response.status === 401) {
        setLocked(true);
        return false;
      }
      if (!response.ok) return false;
      const data = await response.json() as ServerState;
      setServerState(data);
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

  async function importStocks(files: FileList | null) {
    await importFile(files);
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

  async function runAnalysis() {
    setBusy("ai");
    try {
      const response=await fetch("/backend/ai/analyze",{method:"POST",headers:authHeaders(true),body:JSON.stringify({prompt:""})});
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
    setEvents((current)=>[...current,event].sort((a,b)=>a.date.localeCompare(b.date)));
    setModal(false);
    const response = await fetch("/api/calendar", { method:"POST", headers:{"content-type":"application/json","x-app-key":sessionStorage.getItem("family-key")||""}, body:JSON.stringify(event) }).catch(()=>null);
    const result = response?.ok ? await response.json().catch(()=>null) : null;
    setToast(result?.configured ? "공유 Google 캘린더에 추가했어요." : "일정을 저장했어요. Google 연동 후 자동 동기화됩니다.");
  }

  if (locked) {
    return <main className="lock-screen"><div className="lock-card"><span className="brand-mark"><i/><i/><i/></span><span className="eyebrow">Private family app</span><h1>우리 둘만의 공간</h1><p>비공개 웹앱에 설정한 접근 키를 입력해 주세요.</p><form onSubmit={async (event)=>{event.preventDefault(); const ok = await loadState(accessKey); if (!ok) setToast("접근 키가 맞지 않아요.");}}><input type="password" value={accessKey} onChange={(event)=>setAccessKey(event.target.value)} placeholder="접근 키" autoComplete="current-password" required/><button className="primary-button full">들어가기</button></form></div>{toast && <div className="toast" role="status">{toast}</div>}</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={()=>setTab("summary")} aria-label="온리 홈"><span className="brand-mark"><i/><i/><i/></span><span><b>온리</b><small>우리 둘의 자산</small></span></button>
        <div className="top-actions"><button onClick={()=>setHidden(!hidden)} aria-label={hidden?"금액 표시":"금액 숨기기"}><Icon name="eye" /></button><button className="avatar-button">우</button></div>
      </header>

      <nav className="top-nav" aria-label="전체 메뉴">{navItems.map((item)=><button key={item.id} className={tab===item.id?"active":""} onClick={()=>setTab(item.id)}>{item.label}</button>)}</nav>

      <div className="content">
        {tab === "summary" && <Summary hidden={hidden} setTab={setTab} portfolio={portfolio} transactions={transactions} onImport={importFile} importStatus={importStatus} importing={busy==="import"} />}
        {tab === "family" && <Family hidden={hidden} portfolio={portfolio} />}
        {tab === "stocks" && <Stocks hidden={hidden} holdings={serverState?.holdings||[]} summary={serverState?.summary} exchangeRate={serverState?.exchange_rate||null} analysis={serverState?.latest_analysis||null} busy={busy} onImport={importStocks} onRefresh={refreshMarket} onAnalyze={runAnalysis} onSave={saveHolding} />}
        {tab === "ledger" && <Ledger hidden={hidden} transactions={transactions} onImport={importFile} />}
        {tab === "crypto" && <Crypto hidden={hidden} />}
        {tab === "realestate" && <RealEstate hidden={hidden} portfolio={portfolio} />}
        {tab === "calendar" && <CalendarScreen events={events} onAdd={()=>setModal(true)} />}
        {tab === "settings" && <Settings protectedMode={protectedMode} integrations={serverState?.integrations||{}} busy={busy} onProbe={probeIntegrations} />}
      </div>

      <button className="fab" aria-label="빠른 추가" onClick={()=>tab === "calendar" ? setModal(true) : setTab("ledger")}><Icon name="plus" /></button>
      <nav className="bottom-nav" aria-label="주요 메뉴">
        {[{id:"summary",label:"홈",icon:"home"},{id:"stocks",label:"자산",icon:"chart"},{id:"ledger",label:"가계부",icon:"wallet"},{id:"calendar",label:"일정",icon:"calendar"},{id:"settings",label:"설정",icon:"settings"}].map((item)=><button key={item.id} className={tab===item.id || (item.id==="stocks" && ["family","crypto","realestate"].includes(tab))?"active":""} onClick={()=>setTab(item.id as TabId)}><Icon name={item.icon}/><small>{item.label}</small></button>)}
      </nav>
      <div className="sr-only" aria-live="polite">현재 화면: {activeTitle}</div>
      {toast && <div className="toast" role="status">{toast}</div>}
      {modal && <EventModal onClose={()=>setModal(false)} onSave={addEvent} />}
    </main>
  );
}
