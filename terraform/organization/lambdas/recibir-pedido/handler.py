import json
import os
import uuid

import api
import boto3

sqs = boto3.client("sqs")
QUEUE_URL = os.environ["QUEUE_URL"]


def handler(event, context):
    if "cliente" not in api.grupos(event):
        return api.respuesta(403, {"error": "solo los clientes pueden crear pedidos"})

    try:
        pedido = _validar(api.cuerpo_json(event))
    except (ValueError, KeyError, TypeError) as e:
        return api.respuesta(400, {"error": f"pedido invalido: {e}"})

    pedido["cliente_id"] = api.claims(event)["sub"]

    sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(pedido),
        MessageGroupId=str(pedido["comercio_id"]),
        MessageDeduplicationId=pedido["pedido_id"],
    )
    return api.respuesta(202, {"pedido_id": pedido["pedido_id"]})


def _validar(datos):
    items = [
        {"producto_id": int(i["producto_id"]), "cantidad": int(i["cantidad"])}
        for i in datos["items"]
    ]
    if not items or any(i["cantidad"] <= 0 for i in items):
        raise ValueError("items vacio o con cantidad invalida")
    if len({i["producto_id"] for i in items}) != len(items):
        raise ValueError("productos repetidos")

    entrega = datos["entrega"]
    lat, lng = float(entrega["lat"]), float(entrega["lng"])
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("coordenadas fuera de rango")

    return {
        "pedido_id": str(uuid.UUID(datos["pedido_id"])),
        "comercio_id": int(datos["comercio_id"]),
        "items": items,
        "entrega": {"direccion": str(entrega["direccion"]), "lat": lat, "lng": lng},
    }
    