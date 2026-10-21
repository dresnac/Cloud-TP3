import os
import uuid

import api
import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET"]
MAX_BYTES = 5 * 1024 * 1024


def handler(event, context):
    if "repartidor" not in api.grupos(event):
        return api.respuesta(403, {"error": "solo para repartidores"})
    try:
        pedido_id = str(uuid.UUID(event["pathParameters"]["id"]))
    except ValueError:
        return api.respuesta(400, {"error": "id invalido"})

    clave = f"comprobantes/{pedido_id}/{api.claims(event)['sub']}.jpg"
    subida = s3.generate_presigned_post(
        Bucket=BUCKET,
        Key=clave,
        Fields={"Content-Type": "image/jpeg"},
        Conditions=[
            {"Content-Type": "image/jpeg"},
            ["content-length-range", 1, MAX_BYTES],
        ],
        ExpiresIn=300,
    )
    return api.respuesta(200, subida)
    