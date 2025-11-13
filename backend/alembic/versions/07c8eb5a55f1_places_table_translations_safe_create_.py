"""places table + translations (safe create/alter)"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
# оставить как есть (или твой фактический)
revision = "places_translations_safe"
down_revision = "bd5dd6682fd6"            # <<< ВАЖНО: поставить ВАШ текущий head
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    tables = insp.get_table_names()
    has_places = "places" in tables

    if not has_places:
        # Полное создание таблицы
        op.create_table(
            "places",
            sa.Column("id", sa.BigInteger(),
                      primary_key=True, autoincrement=True),
            sa.Column("source", sa.String(length=32),
                      nullable=False),            # 'osm'
            sa.Column("external_id", sa.BigInteger(),
                      nullable=False),            # osm_id
            # 'node'|'way'|'relation'
            sa.Column("osm_type", sa.String(length=16), nullable=True),
            sa.Column("lat", sa.Float(), nullable=False),
            sa.Column("lon", sa.Float(), nullable=False),
            sa.Column("country_iso2", sa.String(length=2), nullable=False),
            sa.Column(
                "translations",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.UniqueConstraint("source", "external_id",
                                name="uq_place_source_ext"),
        )
        op.create_index(
            "ix_places_country_iso2", "places", ["country_iso2"], unique=False
        )
        # (опционально) гео-индекс можно добавить позже через PostGIS
        return

    # Если таблица уже есть — добавляем недостающее
    cols = {c["name"] for c in insp.get_columns("places")}

    if "osm_type" not in cols:
        op.add_column("places", sa.Column(
            "osm_type", sa.String(length=16), nullable=True))

    if "country_iso2" not in cols:
        # допустим временно NULL, чтобы не падать на существующих строках
        op.add_column("places", sa.Column("country_iso2",
                      sa.String(length=2), nullable=True))
        # при желании: проставь значения и затем сделай ALTER на NOT NULL

    if "translations" not in cols:
        op.add_column(
            "places",
            sa.Column(
                "translations",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
        )
        # уберём server_default, чтобы не мешала в будущем
        op.alter_column("places", "translations", server_default=None)

    # Уникальный ключ (source, external_id)
    uqs = {uq["name"] for uq in insp.get_unique_constraints("places")}
    if "uq_place_source_ext" not in uqs:
        try:
            op.create_unique_constraint(
                "uq_place_source_ext", "places", ["source", "external_id"]
            )
        except Exception:
            # на случай, если уже есть другой UC с этими колонками — пропустим
            pass

    # Индекс по стране
    idx = {i["name"] for i in insp.get_indexes("places")}
    if "ix_places_country_iso2" not in idx and "country_iso2" in cols:
        op.create_index(
            "ix_places_country_iso2", "places", ["country_iso2"], unique=False
        )


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "places" not in insp.get_table_names():
        return

    # Аккуратно удаляем добавленное (если нужно)
    # Сначала индексы/констрейнты
    try:
        op.drop_index("ix_places_country_iso2", table_name="places")
    except Exception:
        pass
    try:
        op.drop_constraint("uq_place_source_ext", "places", type_="unique")
    except Exception:
        pass

    # Затем колонки (удаление опасно, делай только если уверен)
    cols = {c["name"] for c in insp.get_columns("places")}
    if "translations" in cols:
        try:
            op.drop_column("places", "translations")
        except Exception:
            pass
    if "country_iso2" in cols:
        try:
            op.drop_column("places", "country_iso2")
        except Exception:
            pass
    if "osm_type" in cols:
        try:
            op.drop_column("places", "osm_type")
        except Exception:
            pass

    # Если таблицу создавали только этой миграцией и хочешь полностью откатить:
    # op.drop_table("places")
