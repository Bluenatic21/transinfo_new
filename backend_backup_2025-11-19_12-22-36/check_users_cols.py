from configparser import ConfigParser
from sqlalchemy import create_engine, inspect

ini = r'.\alembic.ini'
cfg = ConfigParser()
cfg.read(ini, encoding='utf-8')
url = cfg['alembic']['sqlalchemy.url']

engine = create_engine(url)
insp = inspect(engine)
cols = [c['name'] for c in insp.get_columns('users')]
print('email_verified_at' in cols, cols)
