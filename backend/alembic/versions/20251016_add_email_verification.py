from alembic import op
import sqlalchemy as sa

# делаем нормальный ID ревизии (совпадает с именем файла)
revision = "20251016_add_email_verification"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL"
    )
    op.execute(
        "UPDATE users SET email_verified_at = NOW() WHERE email_verified = TRUE AND email_verified_at IS NULL"
    )

def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at")
