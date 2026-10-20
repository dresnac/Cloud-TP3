import os
from pathlib import Path

import db

AQUI = Path(__file__).parent
SCHEMA = (AQUI / "schema.sql").read_text()
SEED = (AQUI / "seed.sql").read_text()


def handler(event, context):
    conn = db.conexion()
    conn.run(SCHEMA)
    if os.environ.get("CARGAR_DATOS_DEMO") == "true":
        conn.run(SEED)
    version = conn.run("SELECT postgis_version()")[0][0]
    comercios = conn.run("SELECT count(*) FROM comercio")[0][0]
    return {"postgis": version, "comercios": comercios}
