"""add payload JSONB to notifications

Revision ID: e0d7954f5526
Revises: add_subscription_fields
Create Date: 2025-10-23 11:10:07.063973
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e0d7954f5526"
down_revision: Union[str, Sequence[str], None] = "add_subscription_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str, schema: str = "public") -> bool:
    """Return True if column exists (idempotent migrations)."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = [c["name"]
            for c in insp.get_columns(table_name=table, schema=schema)]
    return column in cols


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_column("notifications", "payload"):
        op.add_column(
            "notifications",
            sa.Column("payload", postgresql.JSONB(
                astext_type=sa.Text()), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    if _has_column("notifications", "payload"):
        op.drop_column("notifications", "payload")
