import pytest
from fastapi import HTTPException

from backend.app.auth import LoginRateLimiter, Viewer, issue_token, require_admin, verify_token
from backend.app.config import Settings


def test_signed_session_round_trip() -> None:
    viewer = verify_token(issue_token(Viewer(owner="지우", role="guest")))
    assert viewer == Viewer(owner="지우", role="guest")


def test_tampered_session_is_rejected() -> None:
    token = issue_token(Viewer(owner="성근", role="admin"))
    assert verify_token(f"{token}x") is None


def test_expired_session_is_rejected() -> None:
    token = issue_token(Viewer(owner="윤재", role="guest"), expires_in=-1)
    assert verify_token(token) is None


def test_guest_cannot_use_admin_dependency() -> None:
    with pytest.raises(HTTPException) as error:
        require_admin(Viewer(owner="지우", role="guest"))
    assert error.value.status_code == 403


def test_admin_can_use_admin_dependency() -> None:
    assert require_admin(Viewer(owner="성근", role="admin")).is_admin


def test_login_rate_limiter_blocks_and_recovers() -> None:
    limiter = LoginRateLimiter(maximum=2, window_seconds=60)
    limiter.record_failure("client", now=10)
    limiter.record_failure("client", now=20)
    assert limiter.retry_after("client", now=30) == 40
    assert limiter.retry_after("client", now=71) == 0


def test_success_clears_login_failures() -> None:
    limiter = LoginRateLimiter(maximum=1, window_seconds=60)
    limiter.record_failure("client", now=10)
    limiter.record_success("client")
    assert limiter.retry_after("client", now=11) == 0


def test_funnel_mode_requires_strong_distinct_secrets() -> None:
    config = Settings(
        public_access_mode="funnel",
        auth_secret="short",
        admin_password="short",
        jiwoo_guest_password="",
        yoonjae_guest_password="",
    )
    with pytest.raises(RuntimeError):
        config.validate_security()


def test_funnel_mode_accepts_strong_distinct_secrets() -> None:
    config = Settings(
        public_access_mode="funnel",
        auth_secret="a" * 32,
        admin_password="admin-password-123",
        jiwoo_guest_password="jiwoo-password-123",
        yoonjae_guest_password="yoonjae-password-123",
    )
    config.validate_security()
