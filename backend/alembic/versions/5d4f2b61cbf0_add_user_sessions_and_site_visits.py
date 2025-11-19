"""add user sessions and site visits

Revision ID: 5d4f2b61cbf0
Revises: merge_20250912
Create Date: 2024-06-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "5d4f2b61cbf0"
down_revision = "merge_20250912"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("last_visit_at", sa.DateTime(),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("last_path", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_user_sessions_user_id"),
    )
    op.create_index("ix_user_sessions_last_seen_at",
                    "user_sessions", ["last_seen_at"], unique=False)

    op.create_table(
        "site_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("visited_at", sa.DateTime(),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_site_visits_user_id", "site_visits",
                    ["user_id"], unique=False)
    op.create_index("ix_site_visits_visited_at", "site_visits",
                    ["visited_at"], unique=False)


def downgrade():
    op.drop_index("ix_site_visits_visited_at", table_name="site_visits")
    op.drop_index("ix_site_visits_user_id", table_name="site_visits")
    op.drop_table("site_visits")
    op.drop_index("ix_user_sessions_last_seen_at", table_name="user_sessions")
    op.drop_table("user_sessions")
