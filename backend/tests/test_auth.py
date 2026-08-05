import pytest
from fastapi import HTTPException

from backend.app.auth import Viewer, issue_token, require_admin, verify_token


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
