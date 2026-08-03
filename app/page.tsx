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

type StockHolding = {
  id: string;
  name: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  currency: "KRW" | "USD";
  owner: "성근" | "지은" | "공통";
  institution?: string;
  investedAmount?: number;
  marketValue?: number;
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

const initialStockHoldings: StockHolding[] = [
  { id: "s1", name: "삼성전자", symbol: "005930", quantity: 1000, avgPrice: 75150, currentPrice: 78000, currency: "KRW", owner: "공통" },
  { id: "s2", name: "TIGER 미국S&P500", symbol: "360750", quantity: 312, avgPrice: 191000, currentPrice: 206730, currency: "KRW", owner: "지은" },
  { id: "s3", name: "Apple", symbol: "AAPL", quantity: 138, avgPrice: 224.2, currentPrice: 252.4, currency: "USD", owner: "성근" },
  { id: "s4", name: "QQQ", symbol: "QQQ", quantity: 50, avgPrice: 497.7, currentPrice: 532.1, currency: "USD", owner: "성근" },
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

function Summary({ hidden, setTab, portfolio, transactions, onImport }: { hidden: boolean; setTab: (tab: TabId) => void; portfolio: Portfolio; transactions: Transaction[]; onImport: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
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
      <div className="upload-row bank-upload"><button className="primary-button" onClick={()=>inputRef.current?.click()}>＋ 뱅크샐러드 통합 파일 불러오기</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xls" onChange={(event)=>onImport(event.target.files)} /><span>가계부와 자산을 한 번에 교체해요</span></div>
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

const USD_KRW = 1384;
const holdingValue = (holding: StockHolding) => holding.marketValue ?? holding.quantity * holding.currentPrice * (holding.currency === "USD" ? USD_KRW : 1);
const holdingCost = (holding: StockHolding) => holding.investedAmount ?? holding.quantity * holding.avgPrice * (holding.currency === "USD" ? USD_KRW : 1);

function Stocks({ hidden, holdings, onImport }: { hidden: boolean; holdings: StockHolding[]; onImport: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const totalValue = holdings.reduce((sum, holding)=>sum + holdingValue(holding), 0);
  const totalCost = holdings.reduce((sum, holding)=>sum + holdingCost(holding), 0);
  const gain = totalValue - totalCost;
  const gainPercent = totalCost ? gain / totalCost * 100 : 0;
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="주식 / ETF" title="꾸준히, 멀리 보기" copy="국내외 계좌를 합쳐 수익과 비중을 확인해요." />
      <div className="upload-row stock-upload"><button className="primary-button" onClick={()=>inputRef.current?.click()}>＋ 증권사 내역 불러오기</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={(event)=>onImport(event.target.files)} /><span>xlsx · xls · csv</span><a href="/templates/stock-holdings.csv" download>샘플 양식 ↓</a></div>
      <article className="investment-hero stock-hero"><span>투자 원금 {compactMoney(totalCost)}</span><h2><Amount hidden={hidden}>{compactMoney(totalValue)}</Amount></h2><strong className={gain >= 0 ? "" : "loss-text"}>{gain >= 0 ? "+" : ""}{compactMoney(gain)} ({gainPercent >= 0 ? "+" : ""}{gainPercent.toFixed(1)}%)</strong><div className="spark-bars">{[30,42,36,49,55,51,68,73,69,81,88,96].map((v,i)=><i key={i} style={{height:`${v}%`}} />)}</div></article>
      <div className="stock-upload-note"><span>✓</span><p><b>증권사 양식을 자동으로 읽어요</b><small>종목명 · 종목코드 · 수량 · 평균단가 · 현재가 열을 인식합니다.</small></p></div>
      <div className="section-title-row"><div><span className="eyebrow">보유 종목</span><h2>내 포트폴리오</h2></div><button className="filter-button">수익률순⌄</button></div>
      <div className="asset-list">
        {holdings.map((holding, index) => {
          const cost = holdingCost(holding);
          const rate = cost ? (holdingValue(holding) / cost - 1) * 100 : 0;
          const detail = holding.quantity ? `${holding.symbol || "종목코드 없음"} · ${money(holding.quantity)}주` : holding.institution || "평가금액 기준";
          return <article className="asset-row" key={holding.id}><span className={`asset-logo logo-${index % 4}`}>{holding.name.slice(0,1)}</span><div><b>{holding.name}</b><small>{detail} <em className="owner-chip">{holding.owner}</em></small></div><div className="row-value"><strong><Amount hidden={hidden}>{compactMoney(holdingValue(holding))}</Amount></strong><small className={rate >= 0 ? "positive" : "negative"}>{rate >= 0 ? "+" : ""}{rate.toFixed(1)}%</small></div></article>;
        })}
      </div>
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

function categorize(name: string) {
  if (/마트|마켓|식당|카페|배달|쿠팡이츠|요기요/.test(name)) return "식비";
  if (/주유|택시|버스|지하철|철도|교통/.test(name)) return "교통";
  if (/넷플릭스|유튜브|멜론|구독/.test(name)) return "구독";
  if (/병원|약국|치과/.test(name)) return "건강";
  return "생활";
}

const numberFrom = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;

function dateFromSpreadsheet(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0,10);
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0,10);
  return String(value || "").replace(/[./]/g,"-").slice(0,10);
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
      <div className="upload-row"><button className="primary-button" onClick={()=>inputRef.current?.click()}>＋ 카드·뱅크샐러드 내역 불러오기</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={(e)=>onImport(e.target.files)} /><button className="icon-button" aria-label="자동 분류 새로고침">↻</button></div>
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

function Settings({ protectedMode }: { protectedMode: boolean }) {
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="설정" title="우리 집 데이터 관리" copy="연동 상태와 보안 설정을 한곳에서 확인해요." />
      <article className="profile-panel"><div className="couple-avatars"><span className="avatar man">성</span><span className="avatar woman">지</span></div><div><b>성근 · 지은의 집</b><small>마지막 동기화 방금 전</small></div><span className="secure-badge">비공개</span></article>
      <div className="settings-group"><h2>연동</h2><button><span className="settings-symbol google">G</span><div><b>Google 캘린더</b><small>공유 일정 읽기 · 추가</small></div><em>설정 필요</em><i>›</i></button><button><span className="settings-symbol excel">X</span><div><b>카드 엑셀 가져오기</b><small>xlsx · xls · csv</small></div><i>›</i></button></div>
      <div className="settings-group"><h2>보안 및 저장</h2><button><span className="settings-symbol server">W</span><div><b>비공개 웹 저장소</b><small>{protectedMode ? "접근 키로 보호됨" : "현재 데모 모드"}</small></div><em className={protectedMode?"connected":""}>{protectedMode?"보호 중":"설정 필요"}</em><i>›</i></button><button><span className="settings-symbol privacy">●</span><div><b>데이터 보관</b><small>자산 데이터는 비공개 DB에 암호화 저장</small></div><i>›</i></button></div>
      <div className="privacy-note"><b>우리 둘만 볼 수 있어요</b><p>검색엔진에 노출하지 않고, 접근 키와 HTTPS로 보호하는 비공개 웹앱입니다.</p></div>
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
  const [stockHoldings, setStockHoldings] = useState<StockHolding[]>(initialStockHoldings);
  const [portfolio, setPortfolio] = useState<Portfolio>(initialPortfolio);
  const [events, setEvents] = useState<CalendarEvent[]>(sampleEvents);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [protectedMode, setProtectedMode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [accessKey, setAccessKey] = useState("");

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
      const response = await fetch("/api/state", { headers: { "x-app-key": key } });
      if (response.status === 401) {
        setLocked(true);
        return false;
      }
      if (!response.ok) return false;
      const data = await response.json();
      if (Array.isArray(data.transactions) && data.transactions.length) setTransactions(data.transactions.map((item: Transaction)=>({ ...item, kind: item.kind || "expense" })));
      if (Array.isArray(data.stockHoldings) && data.stockHoldings.length) setStockHoldings(data.stockHoldings);
      if (data.portfolio && typeof data.portfolio === "object") setPortfolio({ ...initialPortfolio, ...data.portfolio });
      setProtectedMode(Boolean(data.protected));
      setLocked(false);
      if (key) sessionStorage.setItem("family-key", key);
      return true;
    } catch {
      return false;
    }
  }

  async function persist(nextTransactions: Transaction[], nextStockHoldings: StockHolding[], nextPortfolio: Portfolio) {
    await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-app-key": sessionStorage.getItem("family-key") || "" }, body: JSON.stringify({ transactions: nextTransactions, stockHoldings: nextStockHoldings, portfolio: nextPortfolio }) }).catch(()=>undefined);
  }

  async function importFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const statusName = workbook.SheetNames.find((name)=>name.replace(/\s/g,"").includes("뱅샐현황"));
      const ledgerName = workbook.SheetNames.find((name)=>name.replace(/\s/g,"").includes("가계부내역"));
      if (statusName && ledgerName) {
        const statusRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[statusName], { header: 1, defval: "", raw: true });
        const ledgerRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[ledgerName], { header: 1, defval: "", raw: true });
        const ledgerHeader = ledgerRows.findIndex((row)=>row.map(String).includes("날짜") && row.map(String).includes("타입") && row.map(String).includes("금액"));
        if (ledgerHeader < 0) throw new Error("missing ledger header");
        const header = ledgerRows[ledgerHeader].map((value)=>String(value).replace(/\s/g,""));
        const col = (name: string) => header.indexOf(name);
        const nameHeader = statusRows.findIndex((row)=>row.map((value)=>String(value).trim()).includes("이름"));
        const customerName = nameHeader >= 0 ? String(statusRows[nameHeader + 1]?.[statusRows[nameHeader].findIndex((value)=>String(value).trim()==="이름")] || "") : "";
        const owner: Portfolio["owner"] = customerName.includes("성근") ? "성근" : customerName.includes("지은") ? "지은" : "공통";
        const importedTransactions = ledgerRows.slice(ledgerHeader + 1).map((row,index)=>{
          const rawType = String(row[col("타입")] || "").trim();
          if (rawType !== "지출" && rawType !== "수입") return null;
          const amount = Math.abs(numberFrom(row[col("금액")]));
          const date = dateFromSpreadsheet(row[col("날짜")]);
          const merchant = String(row[col("내용")] || "내역 없음").trim();
          const category = String(row[col("대분류")] || categorize(merchant) || "미분류").trim();
          if (!date || !amount) return null;
          return { id: `banksalad-${date}-${index}`, date, merchant, category, amount, kind: rawType === "수입" ? "income" as const : "expense" as const, owner };
        }).filter((item): item is Transaction=>Boolean(item)).sort((a,b)=>b.date.localeCompare(a.date));

        const financeStart = statusRows.findIndex((row)=>row.some((value)=>String(value).includes("3.재무현황")));
        const financeEnd = statusRows.findIndex((row,index)=>index > financeStart && row.some((value)=>String(value).includes("4.보험현황")));
        let assetCategory = "기타";
        let debtCategory = "기타";
        const grouped = { cash: 0, investments: 0, realEstate: 0, movable: 0, other: 0 };
        let totalAssets = 0;
        let totalDebts = 0;
        for (const row of statusRows.slice(financeStart + 1, financeEnd)) {
          if (row[1]) assetCategory = String(row[1]).trim();
          if (row[5]) debtCategory = String(row[5]).trim();
          const assetName = String(row[2] || "").trim();
          const assetAmount = Math.max(0, numberFrom(row[4]));
          if (assetName && assetAmount && !/총자산|순자산/.test(assetCategory)) {
            totalAssets += assetAmount;
            if (/부동산/.test(assetCategory)) grouped.realEstate += assetAmount;
            else if (/투자/.test(assetCategory)) grouped.investments += assetAmount;
            else if (/자유입출금|현금|저축|전자금융/.test(assetCategory)) grouped.cash += assetAmount;
            else if (/동산/.test(assetCategory)) grouped.movable += assetAmount;
            else grouped.other += assetAmount;
          }
          const debtName = String(row[6] || "").trim();
          const debtAmount = Math.max(0, numberFrom(row[8]));
          if (debtName && debtAmount && !/총부채/.test(debtCategory)) totalDebts += debtAmount;
        }

        const investmentHeader = statusRows.findIndex((row)=>row.map((value)=>String(value).trim()).includes("투자상품종류"));
        const investmentColumns = investmentHeader >= 0 ? statusRows[investmentHeader].map((value)=>String(value).replace(/\s/g,"")) : [];
        const investmentCol = (name: string)=>investmentColumns.indexOf(name);
        const importedHoldings: StockHolding[] = [];
        if (investmentHeader >= 0) {
          for (let index = investmentHeader + 1; index < statusRows.length; index += 1) {
            const row = statusRows[index];
            const type = String(row[investmentCol("투자상품종류")] || "").trim();
            if (type === "총계" || row.some((value)=>String(value).includes("6.대출현황"))) break;
            const name = String(row[investmentCol("상품명")] || "").trim();
            const marketValue = Math.max(0, numberFrom(row[investmentCol("평가금액")]));
            if (!name || !marketValue || !/주식|펀드/.test(type)) continue;
            importedHoldings.push({ id: `banksalad-stock-${index}`, name, symbol: type, quantity: 0, avgPrice: 0, currentPrice: 0, currency: "KRW", owner, institution: String(row[investmentCol("금융사")] || ""), investedAmount: Math.max(0, numberFrom(row[investmentCol("투자원금")])), marketValue });
          }
        }
        const latestDate = importedTransactions[0]?.date || new Date().toISOString().slice(0,10);
        const importedPortfolio: Portfolio = { source: "뱅크샐러드", asOf: latestDate, owner, totalAssets, totalDebts, netWorth: totalAssets-totalDebts, ...grouped };
        setTransactions(importedTransactions);
        setStockHoldings(importedHoldings);
        setPortfolio(importedPortfolio);
        await persist(importedTransactions, importedHoldings, importedPortfolio);
        setToast(`가계부 ${importedTransactions.length}건과 투자상품 ${importedHoldings.length}개를 업데이트했어요.`);
        return;
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const imported = rows.slice(0, 100).map((row, index) => {
        const values = Object.values(row);
        const merchant = String(row["가맹점명"] || row["이용가맹점"] || row["상호"] || values.find((value)=>typeof value === "string" && value.length > 1) || `가져온 내역 ${index+1}`);
        const rawAmount = row["이용금액"] || row["결제금액"] || row["금액"] || values.find((value)=>typeof value === "number") || 0;
        const rawDate = row["이용일"] || row["결제일"] || row["날짜"] || "2026-08-03";
        const date = rawDate instanceof Date ? rawDate.toISOString().slice(0,10) : String(rawDate).replace(/[./]/g,"-").slice(0,10);
        return { id: `${Date.now()}-${index}`, date, merchant, category: categorize(merchant), amount: Math.abs(Number(String(rawAmount).replace(/[^0-9.-]/g,""))) || 0, kind: "expense" as const, owner: "공통" as const };
      }).filter((item)=>item.amount > 0) as Transaction[];
      if (!imported.length) throw new Error("no rows");
      const next = [...imported, ...transactions];
      setTransactions(next);
      await persist(next, stockHoldings, portfolio);
      setToast(`${file.name}에서 ${imported.length}건을 자동 분류했어요.`);
    } catch {
      setToast("파일을 읽지 못했어요. 날짜·가맹점·금액 열을 확인해 주세요.");
    }
  }

  async function importStocks(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const imported = rows.slice(0, 500).map((source, index) => {
        const row = Object.fromEntries(Object.entries(source).map(([key,value])=>[key.replace(/\s/g,""),value]));
        const name = String(row["종목명"] || row["상품명"] || row["종목"] || row["보유종목"] || "").trim();
        const symbol = String(row["종목코드"] || row["티커"] || row["코드"] || row["Symbol"] || "").trim();
        const quantity = Math.abs(numberFrom(row["보유수량"] || row["잔고수량"] || row["수량"] || row["Quantity"]));
        const avgPrice = Math.abs(numberFrom(row["평균단가"] || row["매입단가"] || row["평균매입가"] || row["매수평균가"] || row["AvgPrice"]));
        const rawCurrent = Math.abs(numberFrom(row["현재가"] || row["평가단가"] || row["종가"] || row["CurrentPrice"]));
        const valuation = Math.abs(numberFrom(row["평가금액"] || row["평가액"] || row["현재금액"] || row["MarketValue"]));
        const currentPrice = rawCurrent || (quantity ? valuation / quantity : 0) || avgPrice;
        const rawCurrency = String(row["통화"] || row["화폐"] || row["Currency"] || "").toUpperCase();
        const currency: StockHolding["currency"] = /USD|달러|US\$/.test(rawCurrency) || (symbol && !/^\d+$/.test(symbol)) ? "USD" : "KRW";
        const rawOwner = String(row["소유자"] || row["명의"] || row["Owner"] || "공통");
        const owner: StockHolding["owner"] = rawOwner.includes("성근") ? "성근" : rawOwner.includes("지은") ? "지은" : "공통";
        return { id: `${Date.now()}-stock-${index}`, name: name || symbol, symbol: symbol || "미지정", quantity, avgPrice, currentPrice, currency, owner };
      }).filter((holding)=>holding.name && holding.quantity > 0 && holding.currentPrice > 0) as StockHolding[];
      if (!imported.length) throw new Error("no holdings");
      setStockHoldings(imported);
      const investmentValue = imported.reduce((sum,holding)=>sum+holdingValue(holding),0);
      const nextPortfolio = { ...portfolio, investments: investmentValue, totalAssets: Math.max(0, portfolio.totalAssets-portfolio.investments+investmentValue), netWorth: Math.max(0, portfolio.totalAssets-portfolio.investments+investmentValue)-portfolio.totalDebts };
      setPortfolio(nextPortfolio);
      await persist(transactions, imported, nextPortfolio);
      setToast(`${file.name}에서 보유 종목 ${imported.length}개를 불러왔어요.`);
    } catch {
      setToast("종목을 읽지 못했어요. 종목명·수량·단가 열을 확인해 주세요.");
    }
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
        {tab === "summary" && <Summary hidden={hidden} setTab={setTab} portfolio={portfolio} transactions={transactions} onImport={importFile} />}
        {tab === "family" && <Family hidden={hidden} portfolio={portfolio} />}
        {tab === "stocks" && <Stocks hidden={hidden} holdings={stockHoldings} onImport={importStocks} />}
        {tab === "ledger" && <Ledger hidden={hidden} transactions={transactions} onImport={importFile} />}
        {tab === "crypto" && <Crypto hidden={hidden} />}
        {tab === "realestate" && <RealEstate hidden={hidden} portfolio={portfolio} />}
        {tab === "calendar" && <CalendarScreen events={events} onAdd={()=>setModal(true)} />}
        {tab === "settings" && <Settings protectedMode={protectedMode} />}
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
