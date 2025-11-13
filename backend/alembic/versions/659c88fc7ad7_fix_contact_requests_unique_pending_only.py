"""fix contact_requests unique (pending only)

Revision ID: 659c88fc7ad7
Revises: d7a99bc1d802
Create Date: 2025-09-05 20:38:22.813927
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "659c88fc7ad7"
down_revision: Union[str, Sequence[str], None] = "d7a99bc1d802"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # 0) Снимаем старое жёсткое ограничение (если оно есть):
    #    uq_contact_request  => UNIQUE(sender_id, receiver_id) для всех статусов.
    #    Нам нужно разрешить историю и дубликаты для non-pending,
    #    оставляя уникальность только для pending.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_contact_request'
                  AND conrelid = 'contact_requests'::regclass
            ) THEN
                ALTER TABLE contact_requests
                DROP CONSTRAINT uq_contact_request;
            END IF;
        END
        $$;
        """
    )

    # 1) Чистим направленные дубли PENDING: (sender_id, receiver_id) одинаковые
    op.execute(
        """
        DELETE FROM contact_requests a
        USING contact_requests b
        WHERE a.status = 'pending'
          AND b.status = 'pending'
          AND a.sender_id = b.sender_id
          AND a.receiver_id = b.receiver_id
          AND a.id > b.id;
        """
    )

    # 2) Чистим взаимные дубли PENDING (кросс-направление):
    #    a: (s -> r, pending) и b: (r -> s, pending) -> оставляем запись с меньшим id
    op.execute(
        """
        DELETE FROM contact_requests a
        USING contact_requests b
        WHERE a.status = 'pending'
          AND b.status = 'pending'
          AND a.sender_id = b.receiver_id
          AND a.receiver_id = b.sender_id
          AND a.id > b.id;
        """
    )

    # 3) Уникальность только для PENDING (направленная пара)
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_requests_pending_pair
        ON contact_requests (sender_id, receiver_id)
        WHERE status = 'pending';
        """
    )

    # 4) (Рекомендуется) уникальность для PENDING в "неориентированном" виде:
    #    запрещает одновременные встречные pending-заявки между той же парой пользователей
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_requests_pending_undirected
        ON contact_requests (
            LEAST(sender_id, receiver_id),
            GREATEST(sender_id, receiver_id)
        )
        WHERE status = 'pending';
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Откатываем только созданные частичные индексы.
    # Возвращать старый uq_contact_request преднамеренно не будем, чтобы не ломать историю.
    op.execute("DROP INDEX IF EXISTS uq_contact_requests_pending_undirected;")
    op.execute("DROP INDEX IF EXISTS uq_contact_requests_pending_pair;")
