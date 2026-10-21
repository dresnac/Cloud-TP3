import json
import os
import uuid

import api
import boto3

sfn = boto3.client("stepfunctions")
STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]


def handler(event, context):
    if "repartidor" not in api.grupos(event):
        return api.respuesta(403, {"error": "solo para repartidores"})
    try:
        pedido_id = str(uuid.UUID(event["pathParameters"]["id"]))
    except ValueError:
        return api.respuesta(400, {"error": "id invalido"})

    sfn.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        input=json.dumps({"pedido_id": pedido_id, "repartidor_id": api.claims(event)["sub"]}),
    )
    return api.respuesta(202, {"pedido_id": pedido_id})
    