"""add saved_orders and saved_transports

Revision ID: 20250826_add_saved_items
Revises: 20250825_add_contact_notif_types
Create Date: 2025-08-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ИД ревизии — можно оставить как есть или задать своим флагом --rev-id
revision = "20250826_add_saved_items"
down_revision = "20250825_add_contact_notif_types" # замените на id текущей head-ревизии (alembic heads)
branch_labels = None
depends_on = None


def upgrade():
    # saved_orders
    op.create_table(
        "saved_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("user_id", "order_id", name="uq_saved_orders_user_order"),
    )
    op.create_index("ix_saved_orders_user", "saved_orders", ["user_id"])
    op.create_index("ix_saved_orders_order", "saved_orders", ["order_id"])

    # saved_transports (id транспорта — UUID; если у вас TEXT/CHAR — см. комментарий ниже)
    op.create_table(
        "saved_transports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column(
            "transport_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transports.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("user_id", "transport_id", name="uq_saved_transports_user_transport"),
    )
    op.create_index("ix_saved_transports_user", "saved_transports", ["user_id"])
    op.create_index("ix_saved_transports_transport", "saved_transports", ["transport_id"])

    # Если в БД тип уведомлений — PostgreSQL ENUM: добавить недостающие значения.
    # Если у вас NOT native enum (хранится как VARCHAR) — этот блок просто ничего не изменит.
    # Безопасно добавляем недостающие значения в PostgreSQL ENUM (вне транзакции)
    # Если БД не Postgres или тип не существует — вызовы проскочат без эффекта/не требуются.
    try:
        op.get_bind().execute(sa.text("COMMIT"))
        op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ORDER_REMOVED'")
        op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'TRANSPORT_REMOVED'")
    except Exception:
        # на БД без enum `notificationtype` или не Postgres — просто игнор
        pass


def downgrade():
    # Удаляем таблицы (индексы падают вместе с таблицей, но явные drop_index не помешают)
    op.drop_index("ix_saved_transports_transport", table_name="saved_transports")
    op.drop_index("ix_saved_transports_user", table_name="saved_transports")
    op.drop_table("saved_transports")

    op.drop_index("ix_saved_orders_order", table_name="saved_orders")
    op.drop_index("ix_saved_orders_user", table_name="saved_orders")
    op.drop_table("saved_orders")

    # Откаты значения ENUM обычно не требуется/небезопасно (Postgres не умеет drop value из enum).
    # Если очень нужно, храните NotificationType как VARCHAR (native_enum=False) — тогда миграция enum не нужна.
