import json
import os
import ssl
from contextlib import contextmanager

import boto3
import pg8000.native

CA_BUNDLE = "/opt/rds-ca/global-bundle.pem"

_conn = None


def _credenciales():
    sm = boto3.client("secretsmanager")
    secreto = sm.get_secret_value(SecretId=os.environ["DB_SECRET_ARN"])
    return json.loads(secreto["SecretString"])


def conexion():
    global _conn
    if _conn is None:
        c = _credenciales()
        _conn = pg8000.native.Connection(
            user=c["username"],
            password=c["password"],
            host=c["host"],
            port=int(c["port"]),
            database=c["dbname"],
            ssl_context=ssl.create_default_context(cafile=CA_BUNDLE),
        )
    return _conn

def consultar(sql, **params):
    global _conn
    conn = conexion()
    try:
        filas = conn.run(sql, **params)
    except pg8000.native.InterfaceError:
        _conn = None
        raise
    # INSERT/UPDATE sin RETURNING no devuelven columnas (conn.columns es None).
    if conn.columns is None:
        return []
    columnas = [c["name"] for c in conn.columns]
    return [dict(zip(columnas, fila)) for fila in filas]

@contextmanager
def transaccion():
    conn = conexion()
    conn.run("START TRANSACTION")
    try:
        yield
        conn.run("COMMIT")
    except Exception:
        conn.run("ROLLBACK")
        raise