"""add stars10 (1..10) to reviews and backfill from legacy (idempotent)"""

from alembic import op
import sqlalchemy as sa

# ВАЖНО: оставь эти идентификаторы как у тебя в проекте.
revision = "add_stars10_to_reviews"
down_revision = "add_reviews_table"
branch_labels = None
depends_on = None


def upgrade():
    # 1) Добавить колонку, если её ещё нет
    op.execute("""
        ALTER TABLE reviews
        ADD COLUMN IF NOT EXISTS stars10 smallint;
    """)

    # 2) Чек-констрейнт для диапазона (если ещё не создан)
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ck_reviews_stars10_range'
          ) THEN
            ALTER TABLE reviews
            ADD CONSTRAINT ck_reviews_stars10_range
            CHECK (stars10 IS NULL OR (stars10 >= 1 AND stars10 <= 10));
          END IF;
        END
        $$;
    """)

    # 3) Бэкфилл из legacy-полей (0..10 усреднение -> округление до 1..10), только если stars10 ещё пустой
    op.execute("""
        UPDATE reviews
        SET stars10 = LEAST(10, GREATEST(1,
            ROUND((punctuality + communication + professionalism + terms) / 4.0)
        ))
        WHERE stars10 IS NULL
          AND punctuality IS NOT NULL
          AND communication IS NOT NULL
          AND professionalism IS NOT NULL
          AND terms IS NOT NULL;
    """)


def downgrade():
    # Снять констрейнт и удалить колонку, если есть
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ck_reviews_stars10_range'
          ) THEN
            ALTER TABLE reviews DROP CONSTRAINT ck_reviews_stars10_range;
          END IF;
        END
        $$;
    """)
    op.execute("ALTER TABLE reviews DROP COLUMN IF EXISTS stars10;")
