import db
import pg8000.native

RESULTADOS = {"ACEPTADA", "RECHAZADA", "VENCIDA", "CANCELADO"}
VIOLACION_UNIQUE = "23505"


def handler(event, context):
    pedido_id = event["pedido_id"]
    resultado = event["resultado"]
    if resultado not in RESULTADOS:
        raise ValueError(f"resultado invalido: {resultado}")

    if resultado == "CANCELADO":
        with db.transaccion():
            db.consultar(
                "UPDATE asignacion SET estado = 'VENCIDA', respondido_en = now()"
                " WHERE pedido_id = :pedido AND estado = 'PENDIENTE'",
                pedido=pedido_id,
            )
            _cambiar_estado(pedido_id, "CANCELADO")
        return {"estado": "CANCELADO"}

    repartidor_id = event["repartidor_id"]
    if resultado == "ACEPTADA" and event.get("respondio") != repartidor_id:
        raise ValueError("acepto un repartidor distinto al ofrecido")

    try:
        with db.transaccion():
            db.consultar(
                "UPDATE asignacion SET estado = :resultado, respondido_en = now()"
                " WHERE pedido_id = :pedido AND repartidor_id = :repartidor"
                " AND estado = 'PENDIENTE'",
                resultado=resultado,
                pedido=pedido_id,
                repartidor=repartidor_id,
            )
            if resultado == "ACEPTADA":
                if _cambiar_estado(pedido_id, "ASIGNADO", repartidor_id):
                    return {"estado": "ASIGNADO", "repartidor_id": repartidor_id}
                return {"estado": "NO_ASIGNABLE"}
    except pg8000.native.DatabaseError as e:
        if not (e.args and e.args[0].get("C") == VIOLACION_UNIQUE):
            raise
        with db.transaccion():
            db.consultar(
                "UPDATE asignacion SET estado = 'RECHAZADA', respondido_en = now()"
                " WHERE pedido_id = :pedido AND repartidor_id = :repartidor"
                " AND estado = 'PENDIENTE'",
                pedido=pedido_id,
                repartidor=repartidor_id,
            )
        return {"estado": "NO_ASIGNABLE"}

    return {"estado": resultado}


def _cambiar_estado(pedido_id, estado, repartidor_id=None):
    cambiado = db.consultar(
        "UPDATE pedido SET estado = :estado,"
        " repartidor_id = COALESCE(:repartidor, repartidor_id)"
        " WHERE id = :id AND estado = 'CREADO' RETURNING id",
        estado=estado,
        repartidor=repartidor_id,
        id=pedido_id,
    )
    if cambiado:
        db.consultar(
            "INSERT INTO pedido_evento (pedido_id, estado) VALUES (:id, :estado)",
            id=pedido_id,
            estado=estado,
        )
    return bool(cambiado)
