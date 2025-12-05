from alembic import op
import sqlalchemy as sa

# идентификаторы поправь при необходимости под свои (см. `alembic heads`)
revision = "add_views_20251029"
down_revision = "phone_verifications_20251027"
branch_labels = None
depends_on = None

def upgrade():
    # безопасно для Postgres
    op.execute("ALTER TABLE orders     ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE transports ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;")
    # если нужно избавиться от дефолта после создания — раскомментируй:
    # op.execute("ALTER TABLE orders     ALTER COLUMN views DROP DEFAULT;")
    # op.execute("ALTER TABLE transports ALTER COLUMN views DROP DEFAULT;")

def downgrade():
    op.execute("ALTER TABLE orders     DROP COLUMN IF EXISTS views;")
    op.execute("ALTER TABLE transports DROP COLUMN IF EXISTS views;")
