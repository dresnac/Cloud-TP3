import json
import os
from datetime import datetime, timezone

import api
import boto3

kinesis = boto3.client("kinesis")
STREAM_NAME = os.environ["STREAM_NAME"]


def handler(event, context):
    if "repartidor" not in api.grupos(event):
        return api.respuesta(403, {"error": "solo para repartidores"})

    try:
        datos = api.cuerpo_json(event)
        lat, lng = float(datos["lat"]), float(datos["lng"])
    except (ValueError, KeyError, TypeError):
        return api.respuesta(400, {"error": "faltan 'lat' y 'lng'"})
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return api.respuesta(400, {"error": "coordenadas fuera de rango"})

    # El id sale del token, nunca del body: un repartidor no puede mover a otro.
    repartidor_id = api.claims(event)["sub"]
    posicion = {
        "repartidor_id": repartidor_id,
        "lat": lat,
        "lng": lng,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    try:
        # PartitionKey = repartidor: todas sus posiciones caen en el mismo
        # shard y los consumidores las leen en orden.
        kinesis.put_record(
            StreamName=STREAM_NAME,
            Data=json.dumps(posicion),
            PartitionKey=repartidor_id,
        )
    except kinesis.exceptions.ProvisionedThroughputExceededException:
        # El shard esta al limite: la app reintenta con la proxima posicion.
        return api.respuesta(503, {"error": "demasiadas posiciones, reintentar"})
    return api.respuesta(202, {"ok": True})
