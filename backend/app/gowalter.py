"""Build portfolio prompts from the local Gowalter investment archive."""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import settings


FALLBACK_ONEPAGE = """Gowalter 관점 한 장 요약
- 거시 -> 이벤트 해석 -> 구조적 성장 -> 분할 대응 순서로 본다.
- 전쟁, 관세, 급락은 이벤트인지 추세 훼손인지 먼저 구분한다.
- AI 슈퍼사이클은 LLM -> 에이전틱 AI -> 로봇/자동화 -> 전력·반도체·데이터센터 -> AI 바이오·헬스케어로 확장된다고 본다.
- 추격매수보다 조정 대응을 선호하고, 현금 규칙과 버틸 체력을 중시한다.
- 남의 강한 확신은 그대로 복사하지 않고 내 비중과 손실 허용 범위로 다시 번역한다.
"""

FALLBACK_INSTRUCTION = """내 투자 판단 기준
- 목표는 예측보다 흔들릴 때도 같은 기준으로 대응하는 운영체계를 만드는 것이다.
- 판단 순서는 거시 -> 지수/섹터 -> 종목이다.
- 손실 종목은 물타기보다 투자 아이디어가 깨졌는지 먼저 본다.
- 구조적 성장은 길게 보되, 밸류에이션과 실적을 함께 확인한다.
- 답변은 투자 권유가 아닌 요약 -> 구분 -> 액션 순서의 점검 초안이어야 한다.
"""


def _archive_dir() -> Path:
    configured = os.getenv("GOWALTER_ARCHIVE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    project_archive = settings.data_dir / "gowalter"
    if project_archive.exists():
        return project_archive
    return Path.home() / "Downloads" / "obsidian_note" / "personal" / "investing"


def _read_text(filename: str) -> str:
    path = _archive_dir() / filename
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _compact_markdown(text: str, max_chars: int) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            text = parts[2]
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("> [!") or line.startswith("![]("):
            continue
        lines.append(line)
    compact = "\n".join(lines)
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 16].rstrip() + "\n(이하 생략)"


def _quote_lines(limit: int = 6) -> list[str]:
    quotes: list[str] = []
    for raw_line in _read_text("gowalter_어록.md").splitlines():
        line = raw_line.strip()
        if not line.startswith("- "):
            continue
        cleaned = line[2:].strip().replace("`", "")
        if cleaned and not cleaned.startswith(("출처:", "메모:")):
            quotes.append(cleaned)
        if len(quotes) >= limit:
            break
    return quotes


@lru_cache(maxsize=1)
def _posts() -> tuple[dict[str, Any], ...]:
    path = _archive_dir() / "gowalter_blog_posts.json"
    if not path.exists():
        return ()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ()
    posts = raw if isinstance(raw, list) else raw.get("posts", [])
    return tuple(post for post in posts if isinstance(post, dict))


def _keywords(holdings: list[Any]) -> list[str]:
    keywords: set[str] = set()
    for holding in holdings[:30]:
        for value in (getattr(holding, "name", ""), getattr(holding, "ticker", ""), getattr(holding, "asset_type", "")):
            for token in re.split(r"[\s_/,&()·-]+", str(value)):
                normalized = token.strip().lower()
                if len(normalized) >= 2:
                    keywords.add(normalized)
    return sorted(keywords)


def _related_posts(holdings: list[Any], limit: int = 6) -> list[dict[str, str]]:
    keywords = _keywords(holdings)
    scored: list[tuple[int, dict[str, Any]]] = []
    for post in _posts():
        title = str(post.get("title", ""))
        searchable = " ".join(str(post.get(key, "")) for key in ("title", "category", "theme", "brief_contents")).lower()
        score = sum(3 if keyword in title.lower() else 1 for keyword in keywords if keyword in searchable)
        if score:
            scored.append((score, post))
    scored.sort(key=lambda entry: entry[0], reverse=True)
    return [
        {
            "title": str(post.get("title", "제목 없음")),
            "url": str(post.get("url", "")),
            "published_at": str(post.get("published_at", ""))[:10],
            "summary": str(post.get("brief_contents", ""))[:220],
        }
        for _, post in scored[:limit]
    ]


def archive_status() -> dict[str, Any]:
    directory = _archive_dir()
    source_files = ["instruction.md", "gowalter_onepage.md", "gowalter_investing.md", "gowalter_어록.md", "gowalter_blog_posts.json"]
    existing = [filename for filename in source_files if (directory / filename).exists()]
    return {
        "archive_ready": len(existing) >= 2,
        "source_label": f"Gowalter 아카이브 {len(existing)}/{len(source_files)}개 · 블로그 {_posts().__len__():,}편",
        "archive_dir": str(directory),
        "files": existing,
    }


def build_gowalter_prompt(current_context: str, holdings: list[Any]) -> dict[str, Any]:
    onepage = _compact_markdown(_read_text("gowalter_onepage.md"), 2600) or FALLBACK_ONEPAGE
    instruction = _compact_markdown(_read_text("instruction.md"), 3000) or FALLBACK_INSTRUCTION
    quotes = _quote_lines()
    related = _related_posts(holdings)
    related_lines = [
        f"- {post['published_at']} [{post['title']}]({post['url']}): {post['summary']}"
        for post in related
    ]
    prompt = f"""아래 가족 포트폴리오를 Gowalter 블로그의 관점을 '정답'이 아닌 해석 렌즈로 사용해 분석해 주세요.

내 투자 운영 원칙:
{instruction}

Gowalter 관점:
{onepage}

행동 원칙/어록:
{chr(10).join(f'- {quote}' for quote in quotes) if quotes else '- 조정 대응, 현금 규칙, 장기 구조적 성장을 중심으로 판단합니다.'}

현재 SQLite 포트폴리오:
{current_context}

현재 보유 종목과 관련성이 높은 Gowalter 블로그 글:
{chr(10).join(related_lines) if related_lines else '- 직접 관련 글이 없어 핵심 프레임만 적용합니다.'}

분석 요청:
1. 먼저 전체 자산 배분, 상위 5개 집중도, 현금 대응력을 숫자로 요약하세요.
2. 거시 -> 지수/섹터 -> 개별 종목 순서로 현재 포트폴리오를 해석하세요.
3. 단기 이벤트와 장기 추세 훼손을 구분하고, 근거가 부족하면 '추가 확인 필요'라고 쓰세요.
4. AI·반도체·전력·데이터센터·로봇/자동화 등 구조적 성장 노출이 과도하거나 중복되는지 점검하세요.
5. 수익 종목은 추격보다 비중 관리를, 손실 종목은 물타기보다 투자 아이디어 훼손 여부를 우선 점검하세요.
6. 유지 / 축소 검토 / 추가 확인 / 현금 대기 후보를 조건형으로 구분하세요.
7. 'Gowalter 관점'과 '그대로 따라 하면 안 되는 점'을 별도 섹션으로 작성하세요.
8. 마지막에 이번 달 실행할 체크리스트를 3~5개 제안하세요.
9. 확정적인 매수·매도 권유를 피하고, 제공된 데이터에 기반한 추론임을 밝히세요.
10. 한국어 Markdown으로 간결하게 답하세요.
""".strip()
    status = archive_status()
    return {
        "prompt": prompt,
        "related_posts": related,
        "lens_summary": "거시 → 이벤트/추세 구분 → 구조적 성장 → 분할 대응",
        **status,
    }
