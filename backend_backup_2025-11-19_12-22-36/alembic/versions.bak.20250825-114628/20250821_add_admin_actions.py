# alembic revision -m "add admin_actions"
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250821_add_admin_actions"
down_revision = "c84002d39f2f"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "admin_actions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("admin_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("target_type", sa.String(length=50), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column("payload_before", sa.Text(), nullable=True),
        sa.Column("payload_after", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_admin_actions_id", "admin_actions", ["id"])

def downgrade():
    op.drop_index("ix_admin_actions_id", table_name="admin_actions")
    op.drop_table("admin_actions")
