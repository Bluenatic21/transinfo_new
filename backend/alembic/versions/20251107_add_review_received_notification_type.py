"""add REVIEW_RECEIVED to notificationtype enum"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251107_add_review_received_notification_type"
down_revision = "add_views_20251029"
branch_labels = None
depends_on = None


NOTIF_ENUM_NAME = "notificationtype"
NEW_VALUE = "REVIEW_RECEIVED"


def upgrade():
    # Add the new value if it hasn't been added yet. Safe for Postgres 10+.
    op.execute(
        sa.text(
            f"ALTER TYPE {NOTIF_ENUM_NAME} ADD VALUE IF NOT EXISTS '{NEW_VALUE}'"
        )
    )


def downgrade():
    # Rolling back ENUM changes is destructive; recreate the type without the value.
    # This keeps downgrade workable if needed while remaining safe on repeated runs.
    tmp_type = f"{NOTIF_ENUM_NAME}_tmp"
    op.execute(
        sa.text(
            f"CREATE TYPE {tmp_type} AS ENUM (\n"
            "    'ORDER', 'BID', 'CHAT', 'SYSTEM',\n"
            "    'ORDER_OVERDUE_1', 'ORDER_OVERDUE_4', 'ORDER_OVERDUE_7', 'ORDER_AUTO_DISABLED',\n"
            "    'TRANSPORT_OVERDUE_1', 'TRANSPORT_OVERDUE_4', 'TRANSPORT_OVERDUE_7', 'TRANSPORT_AUTO_DISABLED',\n"
            "    'TRANSPORT_REMOVED', 'ORDER_REMOVED', 'AUTO_MATCH',\n"
            "    'CONTACT_REQUEST', 'CONTACT_ACCEPTED', 'CONTACT_DECLINED'\n"
            ")"
        )
    )
    op.execute(sa.text("ALTER TABLE notifications ALTER COLUMN type DROP DEFAULT"))
    op.execute(
        sa.text(
            f"ALTER TABLE notifications ALTER COLUMN type TYPE {tmp_type} "
            f"USING type::text::{tmp_type}"
        )
    )
    op.execute(sa.text(f"DROP TYPE {NOTIF_ENUM_NAME}"))
    op.execute(sa.text(f"ALTER TYPE {tmp_type} RENAME TO {NOTIF_ENUM_NAME}"))