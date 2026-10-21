import json

import api
import boto3

sfn = boto3.client("stepfunctions")


def handler(event, context):
    if "repartidor" not in api.grupos(event):
        return api.respuesta(403, {"error": "solo para repartidores"})

    try:
        datos = api.cuerpo_json(event)
        aceptar = datos["aceptar"]
        token = datos["task_token"]
    except (ValueError, KeyError, TypeError):
        return api.respuesta(400, {"error": "faltan 'aceptar' y 'task_token'"})
    if not isinstance(aceptar, bool) or not isinstance(token, str):
        return api.respuesta(400, {"error": "datos invalidos"})

    try:
        if aceptar:
            sfn.send_task_success(
                taskToken=token,
                output=json.dumps({"repartidor_id": api.claims(event)["sub"]}),
            )
        else:
            sfn.send_task_failure(taskToken=token, error="Rechazado")
    except (
        sfn.exceptions.TaskTimedOut,
        sfn.exceptions.TaskDoesNotExist,
        sfn.exceptions.InvalidToken,
    ):
        return api.respuesta(409, {"error": "la oferta ya no esta vigente"})

    return api.respuesta(200, {"aceptada": aceptar})
