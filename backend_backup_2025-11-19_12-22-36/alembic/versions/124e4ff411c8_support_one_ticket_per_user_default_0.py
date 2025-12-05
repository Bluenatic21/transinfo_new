"""support: one ticket per user + default 0

Revision ID: 124e4ff411c8
Revises: cc79402a76e9
Create Date: 2025-09-02 15:45:21.025190
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "124e4ff411c8"
down_revision: Union[str, Sequence[str], None] = "cc79402a76e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Идемпотентно закрепляем политику саппорта:
    - у каждого user всегда один тикет (UNIQUE(user_id));
    - дефолт auto_close_after_hours = 0;
    - приводим существующие строки к 0;
    - (безопасно) сводим историю дубликатов в один саппорт-чат.
    Все операторы рассчитаны на повторный запуск (ничего не сломают).
    """

    # --- 1) Свести возможные дубликаты тикетов к одному чату на пользователя (безопасно, если дублей нет) ---
    op.execute("""
    DROP TABLE IF EXISTS tmp_ranked;
    DROP TABLE IF EXISTS tmp_winners;
    DROP TABLE IF EXISTS tmp_losers;

    CREATE TEMP TABLE tmp_ranked AS
    SELECT
      id AS ticket_id,
      user_id,
      chat_id,
      COALESCE(updated_at, created_at) AS ts,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY (chat_id IS NULL) ASC,
                 COALESCE(updated_at, created_at) DESC
      ) AS rn
    FROM support_tickets;

    CREATE TEMP TABLE tmp_winners AS
    SELECT user_id, ticket_id AS main_ticket_id, chat_id AS main_chat_id
    FROM tmp_ranked
    WHERE rn = 1;

    CREATE TEMP TABLE tmp_losers AS
    SELECT user_id, ticket_id AS bad_ticket_id, chat_id AS bad_chat_id
    FROM tmp_ranked
    WHERE rn > 1 AND chat_id IS NOT NULL;

    -- Сообщения переносим в главный чат
    UPDATE chat_message m
    SET chat_id = w.main_chat_id
    FROM tmp_losers l
    JOIN tmp_winners w ON w.user_id = l.user_id
    WHERE m.chat_id = l.bad_chat_id;

    -- Участников переносим в главный (без дублей)
    INSERT INTO chat_participant (chat_id, user_id)
    SELECT DISTINCT w.main_chat_id, p.user_id
    FROM tmp_losers l
    JOIN tmp_winners w ON w.user_id = l.user_id
    JOIN chat_participant p ON p.chat_id = l.bad_chat_id
    LEFT JOIN chat_participant p2
      ON p2.chat_id = w.main_chat_id AND p2.user_id = p.user_id
    WHERE p2.user_id IS NULL;

    -- Чистим участников/чаты/тикеты “лишних”
    DELETE FROM chat_participant p
    USING tmp_losers l
    WHERE p.chat_id = l.bad_chat_id;

    DELETE FROM chat c
    USING tmp_losers l
    WHERE c.id = l.bad_chat_id;

    DELETE FROM support_tickets t
    USING tmp_losers l
    WHERE t.id = l.bad_ticket_id;
    """)

    # --- 2) Один тикет на пользователя (если констрейнта ещё нет) ---
    op.execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'support_tickets'
          AND c.conname = 'uq_support_tickets_user'
      ) THEN
        ALTER TABLE support_tickets
          ADD CONSTRAINT uq_support_tickets_user UNIQUE (user_id);
      END IF;
    END $$;
    """)

    # --- 3) Дефолт 0 и приведение старых строк ---
    op.execute("""
    ALTER TABLE support_tickets
      ALTER COLUMN auto_close_after_hours SET DEFAULT 0;
    """)

    op.execute("""
    UPDATE support_tickets
    SET auto_close_after_hours = 0
    WHERE auto_close_after_hours IS DISTINCT FROM 0;
    """)

    # (необязательно) Убедимся, что колонка NOT NULL,
    # выполняем после апдейта значений
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'support_tickets'
          AND column_name = 'auto_close_after_hours'
          AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE support_tickets
          ALTER COLUMN auto_close_after_hours SET NOT NULL;
      END IF;
    END $$;
    """)


def downgrade() -> None:
    """
    Откат схемы: снимаем NOT NULL/дефолт и, при необходимости, уникальность.
    Обратное “расщепление” объединённых чатов не выполняется (данные уже слиты).
    """
    # Вернём дефолт 24 (как было исторически)
    op.execute("""
    ALTER TABLE support_tickets
      ALTER COLUMN auto_close_after_hours DROP NOT NULL;
    """)

    op.execute("""
    ALTER TABLE support_tickets
      ALTER COLUMN auto_close_after_hours SET DEFAULT 24;
    """)

    # Снимаем уникальность, если требуется откат
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'support_tickets'
          AND c.conname = 'uq_support_tickets_user'
      ) THEN
        ALTER TABLE support_tickets
          DROP CONSTRAINT uq_support_tickets_user;
      END IF;
    END $$;
    """)
