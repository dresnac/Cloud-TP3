import json


def handler(event, context):
    for registro in event["Records"]:
        notificacion = json.loads(registro["Sns"]["Message"])
        print(json.dumps({"notificacion": notificacion}))
        