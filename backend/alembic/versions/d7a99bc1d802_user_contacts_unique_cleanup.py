"""user_contacts unique + cleanup

Revision ID: d7a99bc1d802
Revises: 124e4ff411c8
Create Date: 2025-09-05 18:59:08.527684
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d7a99bc1d802"
down_revision: Union[str, Sequence[str], None] = "124e4ff411c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # 0) Почистить дубликаты связок user_id + contact_id
    op.execute(
        """
        DELETE FROM user_contacts a
        USING user_contacts b
        WHERE a.user_id = b.user_id
          AND a.contact_id = b.contact_id
          AND a.id > b.id;
        """
    )

    # 1) Индексы для быстрых выборок (создадутся только если их нет)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_contacts_user_id ON user_contacts (user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_contacts_contact_id ON user_contacts (contact_id);"
    )

    # 2) CHECK: запрет добавления самого себя
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_user_contacts_not_self'
            ) THEN
                ALTER TABLE user_contacts
                ADD CONSTRAINT ck_user_contacts_not_self CHECK (user_id <> contact_id);
            END IF;
        END
        $$;
        """
    )

    # 3) Уникальность направленной пары (user_id, contact_id)
    #    через уникальный индекс + привязку его как CONSTRAINT
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_contacts_pair_idx
        ON user_contacts (user_id, contact_id);
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_contacts_pair'
            ) THEN
                ALTER TABLE user_contacts
                ADD CONSTRAINT uq_user_contacts_pair
                UNIQUE USING INDEX uq_user_contacts_pair_idx;
            END IF;
        END
        $$;
        """
    )

    # 4) (Опционально, но полезно) — запрет двух pending-запросов между одной парой
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_requests_pending_pair
        ON contact_requests (sender_id, receiver_id)
        WHERE status = 'pending';
        """
    )


def downgrade() -> None:
    """Downgrade schema."""

    # Снимаем ограничения/индексы только если они существуют
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_contacts_pair'
            ) THEN
                ALTER TABLE user_contacts DROP CONSTRAINT uq_user_contacts_pair;
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_user_contacts_not_self'
            ) THEN
                ALTER TABLE user_contacts DROP CONSTRAINT ck_user_contacts_not_self;
            END IF;
        END
        $$;
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_contact_requests_pending_pair;")
    op.execute("DROP INDEX IF EXISTS uq_user_contacts_pair_idx;")
    op.execute("DROP INDEX IF EXISTS ix_user_contacts_contact_id;")
    op.execute("DROP INDEX IF EXISTS ix_user_contacts_user_id;")
