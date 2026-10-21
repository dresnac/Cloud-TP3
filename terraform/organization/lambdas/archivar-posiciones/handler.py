import base64
import os
from datetime import datetime, timezone

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET"]


def handler(event, context):
    registros = event["Records"]
    lineas = [base64.b64decode(r["kinesis"]["data"]).decode() for r in registros]

    primero = registros[0]
    llegada = datetime.fromtimestamp(
        primero["kinesis"]["approximateArrivalTimestamp"], tz=timezone.utc
    )
    shard = primero["eventID"].split(":")[0]
    clave = (
        f"historico/posiciones/fecha={llegada:%Y-%m-%d}/"
        f"{shard}-{primero['kinesis']['sequenceNumber']}.jsonl"
    )

    s3.put_object(Bucket=BUCKET, Key=clave, Body="\n".join(lineas).encode())
    