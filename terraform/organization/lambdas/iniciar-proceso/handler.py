import os

import boto3

sfn = boto3.client("stepfunctions")
STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]


def handler(event, context):
    registros = event["Records"]
    for i, mensaje in enumerate(registros):
        try:
            pedido_id = _pedido_id(mensaje)
            sfn.start_execution(
                stateMachineArn=STATE_MACHINE_ARN,
                name=pedido_id,
                input=mensaje["body"],
            )
        except sfn.exceptions.ExecutionAlreadyExists:
            pass
        except Exception:
            return {
                "batchItemFailures": [
                    {"itemIdentifier": m["messageId"]} for m in registros[i:]
                ]
            }
    return {"batchItemFailures": []}


def _pedido_id(mensaje):
    return mensaje["attributes"]["MessageDeduplicationId"]
    