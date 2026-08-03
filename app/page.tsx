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
  { id: "1", date: "2026-08-03", merchant: "마켓컬리", category: "식비", amount: 68400, owner: "지은" },
  { id: "2", date: "2026-08-02", merchant: "현대오일뱅크", category: "교통", amount: 76000, owner: "성근" },
  { id: "3", date: "2026-08-01", merchant: "넷플릭스", category: "구독", amount: 17000, owner: "성근" },
  { id: "4", date: "2026-07-31", merchant: "교보문고", category: "생활", amount: 28900, owner: "지은" },
];

const initialStockHoldings: StockHolding[] = [
  { id: "s1", name: "삼성전자", symbol: "005930", quantity: 1000, avgPrice: 75150, currentPrice: 78000, currency: "KRW", owner: "공통" },
  { id: "s2", name: "TIGER 미국S&P500", symbol: "360750", quantity: 312, avgPrice: 191000, currentPrice: 206730, currency: "KRW", owner: "지은" },
  { id: "s3", name: "Apple", symbol: "AAPL", quantity: 138, avgPrice: 224.2, currentPrice: 252.4, currency: "USD", owner: "성근" },
  { id: "s4", name: "QQQ", symbol: "QQQ", quantity: 50, avgPrice: 497.7, currentPrice: 532.1, currency: "USD", owner: "성근" },
];

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

function Summary({ hidden, setTab }: { hidden: boolean; setTab: (tab: TabId) => void }) {
  return (
    <section className="screen fade-in" aria-label="자산 요약">
      <div className="hero-card">
        <div className="hero-orb" />
        <span className="eyebrow light">우리 집 순자산</span>
        <h1><Amount hidden={hidden}>12억 4,860만원</Amount></h1>
        <div className="change-pill">↗ 2,740만원 · 이번 달</div>
        <div className="hero-divider" />
        <div className="hero-stats">
          <div><span>총 자산</span><strong><Amount hidden={hidden}>16억 6,200만원</Amount></strong></div>
          <div><span>총 부채</span><strong><Amount hidden={hidden}>4억 1,340만원</Amount></strong></div>
        </div>
      </div>

      <div className="section-title-row">
        <div><span className="eyebrow">한눈에 보기</span><h2>자산 흐름</h2></div>
        <button className="text-button" onClick={() => setTab("family")}>가족별 보기 →</button>
      </div>

      <div className="metric-grid">
        <article className="metric-card peach"><span className="metric-icon">↗</span><p>투자 자산</p><strong><Amount hidden={hidden}>4억 8,920만원</Amount></strong><small>주식 · ETF · 코인</small></article>
        <article className="metric-card blue"><span className="metric-icon">⌂</span><p>부동산</p><strong><Amount hidden={hidden}>10억 8,000만원</Amount></strong><small>시세 2.4% 상승</small></article>
        <article className="metric-card mint"><span className="metric-icon">₩</span><p>이번 달 지출</p><strong><Amount hidden={hidden}>386만원</Amount></strong><small>예산의 64%</small></article>
        <article className="metric-card lilac"><span className="metric-icon">◎</span><p>현금성 자산</p><strong><Amount hidden={hidden}>9,280만원</Amount></strong><small>비상금 포함</small></article>
      </div>

      <article className="panel trend-panel">
        <div className="panel-head">
          <div><span className="eyebrow">최근 6개월</span><h2>순자산 추이</h2></div>
          <span className="positive">+8.7%</span>
        </div>
        <div className="line-chart" aria-label="최근 6개월 순자산 증가 차트">
          {[28, 37, 34, 52, 61, 78, 86, 92].map((height, index) => (
            <i key={index} style={{ height: `${height}%` }}><span /></i>
          ))}
        </div>
        <div className="chart-labels"><span>3월</span><span>4월</span><span>5월</span><span>6월</span><span>7월</span><span>8월</span></div>
      </article>

      <article className="panel allocation-panel">
        <div className="panel-head"><div><span className="eyebrow">포트폴리오</span><h2>자산 구성</h2></div><strong>100%</strong></div>
        <div className="allocation-bar"><i className="a-real" /><i className="a-stock" /><i className="a-cash" /><i className="a-crypto" /></div>
        <div className="legend-grid">
          <span><i className="dot real" />부동산 <b>65.0%</b></span>
          <span><i className="dot stock" />주식/ETF <b>25.4%</b></span>
          <span><i className="dot cash" />현금 <b>5.6%</b></span>
          <span><i className="dot crypto" />암호화폐 <b>4.0%</b></span>
        </div>
      </article>
    </section>
  );
}

function Family({ hidden }: { hidden: boolean }) {
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="가족별" title="둘이 모은 자산" copy="각자의 자산과 공동 자산을 한 화면에서 확인해요." />
      <article className="panel family-share">
        <div className="panel-head"><div><span className="eyebrow">전체 자산 비중</span><h2>함께 만드는 포트폴리오</h2></div></div>
        <div className="donut family-donut"><div><small>총 자산</small><strong><Amount hidden={hidden}>16.6억</Amount></strong></div></div>
        <div className="member-list">
          <div><span className="avatar man">성</span><p><b>성근</b><small><Amount hidden={hidden}>6억 5,480만원</Amount></small></p><strong>39.4%</strong></div>
          <div><span className="avatar woman">지</span><p><b>지은</b><small><Amount hidden={hidden}>10억 720만원</Amount></small></p><strong>60.6%</strong></div>
        </div>
      </article>
      <div className="member-cards">
        <article className="member-card"><div className="avatar man">성</div><span className="eyebrow">성근 자산</span><h2><Amount hidden={hidden}>6억 5,480만원</Amount></h2><div className="mini-bars"><i style={{width:"58%"}} /><i style={{width:"26%"}} /><i style={{width:"16%"}} /></div><small>주식 58% · 현금 26% · 코인 16%</small></article>
        <article className="member-card"><div className="avatar woman">지</div><span className="eyebrow">지은 자산</span><h2><Amount hidden={hidden}>10억 720만원</Amount></h2><div className="mini-bars pink-bars"><i style={{width:"71%"}} /><i style={{width:"20%"}} /><i style={{width:"9%"}} /></div><small>부동산 71% · 주식 20% · 현금 9%</small></article>
      </div>
    </section>
  );
}

const USD_KRW = 1384;
const holdingValue = (holding: StockHolding) => holding.quantity * holding.currentPrice * (holding.currency === "USD" ? USD_KRW : 1);
const holdingCost = (holding: StockHolding) => holding.quantity * holding.avgPrice * (holding.currency === "USD" ? USD_KRW : 1);

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
          const rate = holding.avgPrice ? (holding.currentPrice / holding.avgPrice - 1) * 100 : 0;
          return <article className="asset-row" key={holding.id}><span className={`asset-logo logo-${index % 4}`}>{holding.name.slice(0,1)}</span><div><b>{holding.name}</b><small>{holding.symbol} · {money(holding.quantity)}주 <em className="owner-chip">{holding.owner}</em></small></div><div className="row-value"><strong><Amount hidden={hidden}>{compactMoney(holdingValue(holding))}</Amount></strong><small className={rate >= 0 ? "positive" : "negative"}>{rate >= 0 ? "+" : ""}{rate.toFixed(1)}%</small></div></article>;
        })}
      </div>
    </section>
  );
}

function Crypto({ hidden }: { hidden: boolean }) {
  const coins = [["₿","비트코인","BTC","4,180만원","+18.2%"],["◆","이더리움","ETH","1,460만원","+7.4%"],["S","솔라나","SOL","520만원","-2.1%"]];
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="암호화폐" title="변동성은 작게, 기준은 단단하게" copy="전체 자산의 5% 이내로 관리하고 있어요." />
      <article className="investment-hero crypto-hero"><span>암호화폐 평가금액</span><h2><Amount hidden={hidden}>6,160만원</Amount></h2><strong>오늘 +1.8%</strong><div className="crypto-rings"><i /><i /><i /></div></article>
      <article className="panel risk-card"><div><span className="eyebrow">투자 원칙</span><h2>목표 비중 5%</h2><p>현재 4.0% · 추가 매수 여력 1.0%</p></div><div className="gauge"><i /></div></article>
      <div className="asset-list">{coins.map((coin,index)=><article className="asset-row" key={coin[2]}><span className={`coin-logo coin-${index}`}>{coin[0]}</span><div><b>{coin[1]}</b><small>{coin[2]}</small></div><div className="row-value"><strong><Amount hidden={hidden}>{coin[3]}</Amount></strong><small className={coin[4].startsWith("-")?"negative":"positive"}>{coin[4]}</small></div></article>)}</div>
    </section>
  );
}

function RealEstate({ hidden }: { hidden: boolean }) {
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="부동산" title="우리 집의 오늘 가치" copy="매입가, 현재 시세와 대출을 함께 관리해요." />
      <article className="property-card"><div className="property-visual"><span>HOME 01</span><div className="building"><i/><i/><i/><i/><i/><i/></div></div><div className="property-content"><span className="status-pill">실거주</span><h2>서울 마포구 아파트</h2><p>84.9㎡ · 2022년 매입</p><div className="property-price"><span>현재 평가금액</span><strong><Amount hidden={hidden}>10억 8,000만원</Amount></strong><small>매입가 대비 <b>+8,000만원</b></small></div></div></article>
      <div className="metric-grid property-metrics"><article className="metric-card"><p>남은 대출</p><strong><Amount hidden={hidden}>4억 1,340만원</Amount></strong><small>금리 3.72%</small></article><article className="metric-card"><p>순자산 가치</p><strong><Amount hidden={hidden}>6억 6,660만원</Amount></strong><small>부채비율 38.3%</small></article></div>
      <article className="panel loan-panel"><div className="panel-head"><div><span className="eyebrow">주택담보대출</span><h2>상환 진행률</h2></div><strong>17.3%</strong></div><div className="progress"><i style={{width:"17.3%"}} /></div><div className="loan-stats"><span>상환액 <b><Amount hidden={hidden}>8,660만원</Amount></b></span><span>다음 납입일 <b>8월 25일</b></span></div></article>
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

function Ledger({ hidden, transactions, onImport }: { hidden: boolean; transactions: Transaction[]; onImport: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const total = transactions.reduce((sum, item) => sum + item.amount, 0);
  return (
    <section className="screen fade-in">
      <ScreenHeading eyebrow="2026년 8월" title="이번 달 생활비" copy="카드 내역을 올리면 항목을 자동으로 정리해요." />
      <div className="upload-row"><button className="primary-button" onClick={()=>inputRef.current?.click()}>＋ 카드 내역 불러오기</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={(e)=>onImport(e.target.files)} /><button className="icon-button" aria-label="자동 분류 새로고침">↻</button></div>
      <div className="metric-grid ledger-metrics"><article className="metric-card wide"><p>총 지출</p><strong><Amount hidden={hidden}>{compactMoney(total || 3860000)}</Amount></strong><small>지난달보다 12만원 적어요</small></article><article className="metric-card"><p>일 평균</p><strong><Amount hidden={hidden}>12.4만원</Amount></strong><small>31일 기준</small></article><article className="metric-card"><p>남은 예산</p><strong><Amount hidden={hidden}>214만원</Amount></strong><small>예산의 36%</small></article></div>
      <article className="panel spending-panel"><div className="panel-head"><div><span className="eyebrow">항목별 지출</span><h2>어디에 썼을까요?</h2></div><span className="chip">8월</span></div><div className="spending-chart"><div className="donut expense-donut"><div><small>합계</small><strong><Amount hidden={hidden}>386만원</Amount></strong></div></div><div className="expense-legend"><span><i className="dot food"/>식비 <b>35%</b></span><span><i className="dot living"/>생활 <b>26%</b></span><span><i className="dot transport"/>교통 <b>18%</b></span><span><i className="dot etc"/>기타 <b>21%</b></span></div></div></article>
      <div className="section-title-row"><div><span className="eyebrow">최근 내역</span><h2>결제 내역</h2></div><button className="text-button">전체보기</button></div>
      <div className="transaction-list">{transactions.slice(0,8).map((item)=><article className="transaction-row" key={item.id}><span className="transaction-icon">{item.category === "식비" ? "○" : item.category === "교통" ? "↗" : "◇"}</span><div><b>{item.merchant}</b><small>{item.date.slice(5).replace("-",".")} · {item.category} · {item.owner}</small></div><strong><Amount hidden={hidden}>-{money(item.amount)}원</Amount></strong></article>)}</div>
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
      if (Array.isArray(data.transactions) && data.transactions.length) setTransactions(data.transactions);
      if (Array.isArray(data.stockHoldings) && data.stockHoldings.length) setStockHoldings(data.stockHoldings);
      setProtectedMode(Boolean(data.protected));
      setLocked(false);
      if (key) sessionStorage.setItem("family-key", key);
      return true;
    } catch {
      return false;
    }
  }

  async function persist(nextTransactions: Transaction[], nextStockHoldings: StockHolding[]) {
    await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-app-key": sessionStorage.getItem("family-key") || "" }, body: JSON.stringify({ transactions: nextTransactions, stockHoldings: nextStockHoldings }) }).catch(()=>undefined);
  }

  async function importFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const imported = rows.slice(0, 100).map((row, index) => {
        const values = Object.values(row);
        const merchant = String(row["가맹점명"] || row["이용가맹점"] || row["상호"] || values.find((value)=>typeof value === "string" && value.length > 1) || `가져온 내역 ${index+1}`);
        const rawAmount = row["이용금액"] || row["결제금액"] || row["금액"] || values.find((value)=>typeof value === "number") || 0;
        const rawDate = row["이용일"] || row["결제일"] || row["날짜"] || "2026-08-03";
        const date = rawDate instanceof Date ? rawDate.toISOString().slice(0,10) : String(rawDate).replace(/[./]/g,"-").slice(0,10);
        return { id: `${Date.now()}-${index}`, date, merchant, category: categorize(merchant), amount: Math.abs(Number(String(rawAmount).replace(/[^0-9.-]/g,""))) || 0, owner: "공통" as const };
      }).filter((item)=>item.amount > 0) as Transaction[];
      if (!imported.length) throw new Error("no rows");
      const next = [...imported, ...transactions];
      setTransactions(next);
      await persist(next, stockHoldings);
      setToast(`${file.name}에서 ${imported.length}건을 자동 분류했어요.`);
    } catch {
      setToast("파일을 읽지 못했어요. 날짜·가맹점·금액 열을 확인해 주세요.");
    }
  }

  async function importStocks(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const numberFrom = (value: unknown) => Math.abs(Number(String(value ?? "").replace(/[^0-9.-]/g, ""))) || 0;
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
        const quantity = numberFrom(row["보유수량"] || row["잔고수량"] || row["수량"] || row["Quantity"]);
        const avgPrice = numberFrom(row["평균단가"] || row["매입단가"] || row["평균매입가"] || row["매수평균가"] || row["AvgPrice"]);
        const rawCurrent = numberFrom(row["현재가"] || row["평가단가"] || row["종가"] || row["CurrentPrice"]);
        const valuation = numberFrom(row["평가금액"] || row["평가액"] || row["현재금액"] || row["MarketValue"]);
        const currentPrice = rawCurrent || (quantity ? valuation / quantity : 0) || avgPrice;
        const rawCurrency = String(row["통화"] || row["화폐"] || row["Currency"] || "").toUpperCase();
        const currency: StockHolding["currency"] = /USD|달러|US\$/.test(rawCurrency) || (symbol && !/^\d+$/.test(symbol)) ? "USD" : "KRW";
        const rawOwner = String(row["소유자"] || row["명의"] || row["Owner"] || "공통");
        const owner: StockHolding["owner"] = rawOwner.includes("성근") ? "성근" : rawOwner.includes("지은") ? "지은" : "공통";
        return { id: `${Date.now()}-stock-${index}`, name: name || symbol, symbol: symbol || "미지정", quantity, avgPrice, currentPrice, currency, owner };
      }).filter((holding)=>holding.name && holding.quantity > 0 && holding.currentPrice > 0) as StockHolding[];
      if (!imported.length) throw new Error("no holdings");
      setStockHoldings(imported);
      await persist(transactions, imported);
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
        {tab === "summary" && <Summary hidden={hidden} setTab={setTab} />}
        {tab === "family" && <Family hidden={hidden} />}
        {tab === "stocks" && <Stocks hidden={hidden} holdings={stockHoldings} onImport={importStocks} />}
        {tab === "ledger" && <Ledger hidden={hidden} transactions={transactions} onImport={importFile} />}
        {tab === "crypto" && <Crypto hidden={hidden} />}
        {tab === "realestate" && <RealEstate hidden={hidden} />}
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
