"""SQLAlchemy setup with SQLite settings suitable for a small shared app."""

from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30} if settings.database_url.startswith("sqlite") else {},
)


if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    db: Session = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _add_holding_price_columns()
    _remove_estimated_holding_cost_basis()


def _add_holding_price_columns() -> None:
    """Apply the small additive schema migration needed by existing installs."""
    average_price_added = False
    schema = {
        "holdings": {
            "average_price_krw": "FLOAT",
            "average_price_source": "VARCHAR(40) DEFAULT ''",
        },
        "holding_snapshots": {
            "quantity": "FLOAT",
            "average_price_krw": "FLOAT",
        },
    }
    for table, additions in schema.items():
        columns = {column["name"] for column in inspect(engine).get_columns(table)}
        with engine.begin() as connection:
            for name, definition in additions.items():
                if name not in columns:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))
                    if table == "holdings" and name == "average_price_krw":
                        average_price_added = True

    # Keep the value users saw before this migration, but label it as a legacy
    # calculation so it is never confused with an explicitly entered average.
    if average_price_added:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    UPDATE holdings
                    SET average_price_krw = principal / quantity,
                        average_price_source = 'legacy_calculated'
                    WHERE average_price_krw IS NULL AND quantity IS NOT NULL AND quantity > 0
                    """
                )
            )


def _remove_estimated_holding_cost_basis() -> None:
    """Discard synthetic quantities so they cannot masquerade as broker data."""
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                UPDATE holdings
                SET quantity = NULL,
                    quantity_source = '',
                    average_price_krw = NULL,
                    average_price_source = ''
                WHERE quantity_source = 'estimated_from_import_value'
                   OR (
                        average_price_source = 'legacy_calculated'
                        AND currency = 'KRW'
                        AND asset_type NOT IN ('코인', '암호화폐', 'crypto')
                        AND quantity IS NOT NULL
                        AND ABS(quantity - ROUND(quantity)) > 0.00000001
                   )
                """
            )
        )
