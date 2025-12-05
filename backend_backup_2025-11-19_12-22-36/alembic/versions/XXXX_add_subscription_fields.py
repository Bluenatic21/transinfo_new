from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_subscription_fields"
down_revision = "7efca1fd0def"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column(
        "paid_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("grace_days", sa.Integer(),
                  nullable=False, server_default="0"))


def downgrade():
    op.drop_column("users", "grace_days")
    op.drop_column("users", "paid_until")
