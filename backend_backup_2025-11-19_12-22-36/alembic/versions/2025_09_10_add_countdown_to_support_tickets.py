from alembic import op
import sqlalchemy as sa

revision = "a25910cd9f4e"
down_revision = "d7a99bc1d802"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "support_tickets",
        sa.Column("countdown_started_at", sa.DateTime(
            timezone=True), nullable=True),
    )
    op.create_index(
        "ix_support_tickets_countdown_started_at",
        "support_tickets",
        ["countdown_started_at"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_support_tickets_countdown_started_at",
                  table_name="support_tickets")
    op.drop_column("support_tickets", "countdown_started_at")
