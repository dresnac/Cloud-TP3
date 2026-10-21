import base64
import json
import logging

import db

log = logging.getLogger()
log.setLevel(logging.INFO)


def handler(event, context):
    ultimas = {}
    descartados = 0
    for registro in event["Records"]:
        try:
            posicion = json.loads(base64.b64decode(registro["kinesis"]["data"]))
            repartidor_id, ts = posicion["repartidor_id"], posicion["ts"]
        except (ValueError, KeyError, TypeError):
            # Un registro roto no puede trabar el shard: se descarta y queda
            # igual archivado en S3 por el otro consumidor.
            log.warning("registro descartado: %s", registro["kinesis"]["sequenceNumber"])
            descartados += 1
            continue
        actual = ultimas.get(repartidor_id)
        if actual is None or ts > actual["ts"]:
            ultimas[repartidor_id] = posicion

    with db.transaccion():
        for p in ultimas.values():
            db.consultar(
                "INSERT INTO repartidor_posicion (repartidor_id, ubicacion, actualizado_en)"
                " SELECT id, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,"
                " CAST(:ts AS timestamptz) FROM repartidor WHERE id = :id"
                " ON CONFLICT (repartidor_id) DO UPDATE"
                " SET ubicacion = EXCLUDED.ubicacion, actualizado_en = EXCLUDED.actualizado_en"
                " WHERE repartidor_posicion.actualizado_en < EXCLUDED.actualizado_en",
                id=p["repartidor_id"],
                lat=p["lat"],
                lng=p["lng"],
                ts=p["ts"],
            )

    resumen = {
        "recibidos": len(event["Records"]),
        "descartados": descartados,
        "repartidores": len(ultimas),
    }
    log.info(json.dumps(resumen))
    return resumen
