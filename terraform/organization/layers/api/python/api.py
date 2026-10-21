import base64
import json


def claims(event):
    return event["requestContext"]["authorizer"]["jwt"]["claims"]


def grupos(event):
    return set(claims(event).get("cognito:groups", "").strip("[]").split())


def cuerpo_json(event):
    cuerpo = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        cuerpo = base64.b64decode(cuerpo).decode()
    return json.loads(cuerpo)


def respuesta(estado, cuerpo):
    return {
        "statusCode": estado,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(cuerpo, default=str),
    }
