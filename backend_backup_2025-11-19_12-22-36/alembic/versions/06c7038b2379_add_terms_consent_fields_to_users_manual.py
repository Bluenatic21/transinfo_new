"""add terms consent fields to users (manual, idempotent)"""

from alembic import op
import sqlalchemy as sa

revision = '06c7038b2379'           # оставь как сгенерировал Alembic
down_revision = 'places_translations_safe'
branch_labels = None
depends_on = None


def _col_exists(bind, table_name: str, col_name: str) -> bool:
    insp = sa.inspect(bind)
    return col_name in [c['name'] for c in insp.get_columns(table_name)]


def upgrade():
    bind = op.get_bind()

    # accepted_terms (NOT NULL, backfill через server_default=false)
    if not _col_exists(bind, "users", "accepted_terms"):
        op.add_column(
            "users",
            sa.Column("accepted_terms", sa.Boolean(),
                      nullable=False, server_default=sa.false())
        )
        # убираем постоянный дефолт после бэкфилла
        op.alter_column("users", "accepted_terms", server_default=None)

    # terms_version
    if not _col_exists(bind, "users", "terms_version"):
        op.add_column("users", sa.Column("terms_version",
                      sa.String(length=255), nullable=True))

    # terms_accepted_at
    if not _col_exists(bind, "users", "terms_accepted_at"):
        op.add_column("users", sa.Column("terms_accepted_at",
                      sa.DateTime(timezone=False), nullable=True))

    # terms_accepted_ip
    if not _col_exists(bind, "users", "terms_accepted_ip"):
        op.add_column("users", sa.Column("terms_accepted_ip",
                      sa.String(length=64), nullable=True))


def downgrade():
    bind = op.get_bind()

    if _col_exists(bind, "users", "terms_accepted_ip"):
        op.drop_column("users", "terms_accepted_ip")

    if _col_exists(bind, "users", "terms_accepted_at"):
        op.drop_column("users", "terms_accepted_at")

    if _col_exists(bind, "users", "terms_version"):
        op.drop_column("users", "terms_version")

    if _col_exists(bind, "users", "accepted_terms"):
        op.drop_column("users", "accepted_terms")
