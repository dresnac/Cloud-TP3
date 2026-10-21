import os

import boto3
import db
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET"]


class SinComprobante(Exception):
    pass


class EntregaInvalida(Exception):
    pass


def handler(event, context):
    pedido_id = event["pedido_id"]
    repartidor_id = event["repartidor_id"]
    clave = f"comprobantes/{pedido_id}/{repartidor_id}.jpg"

    try:
        s3.head_object(Bucket=BUCKET, Key=clave)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "403"):
            raise SinComprobante(clave) from e
        raise

    with db.transaccion():
        cambiado = db.consultar(
            "UPDATE pedido SET estado = 'ENTREGADO', comprobante = :clave"
            " WHERE id = :id AND repartidor_id = :repartidor AND estado = 'ASIGNADO'"
            " RETURNING cliente_id",
            clave=clave,
            id=pedido_id,
            repartidor=repartidor_id,
        )
        if cambiado:
            db.consultar(
                "INSERT INTO pedido_evento (pedido_id, estado) VALUES (:id, 'ENTREGADO')",
                id=pedido_id,
            )
            return {"estado": "ENTREGADO", "cliente_id": cambiado[0]["cliente_id"]}

        ya_entregado = db.consultar(
            "SELECT cliente_id FROM pedido WHERE id = :id AND repartidor_id = :repartidor"
            " AND estado = 'ENTREGADO'",
            id=pedido_id,
            repartidor=repartidor_id,
        )
    if ya_entregado:
        return {"estado": "ENTREGADO", "cliente_id": ya_entregado[0]["cliente_id"]}
    raise EntregaInvalida(f"el pedido {pedido_id} no esta asignado a este repartidor")
    