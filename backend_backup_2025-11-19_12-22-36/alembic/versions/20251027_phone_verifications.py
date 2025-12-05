"""create phone_verifications table"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from datetime import datetime

# ревизии
revision = "phone_verifications_20251027"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if not inspect(bind).has_table("phone_verifications"):
        op.create_table(
            "phone_verifications",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("phone", sa.String(32), nullable=False,
                      unique=True, index=True),
            sa.Column("code_hash", sa.String(128), nullable=False),
            sa.Column("expires_at", sa.DateTime(
                timezone=True), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("attempts", sa.Integer,
                      nullable=False, server_default="0"),
            sa.Column("verified_at", sa.DateTime(
                timezone=True), nullable=True),
        )


def downgrade():
    op.drop_table("phone_verifications")
