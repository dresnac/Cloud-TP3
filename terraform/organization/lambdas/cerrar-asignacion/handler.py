import db

RESULTADOS = {"ACEPTADA", "RECHAZADA", "VENCIDA", "CANCELADO"}


def handler(event, context):
    pedido_id = event["pedido_id"]
    resultado = event["resultado"]
    if resultado not in RESULTADOS:
        raise ValueError(f"resultado invalido: {resultado}")

    with db.transaccion():
        if resultado == "CANCELADO":
            # Si quedo una oferta abierta, se cierra: si no, el indice
            # asignacion_una_pendiente deja a ese repartidor sin poder recibir
            # ninguna oferta mas.
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
        db.consultar(
            "UPDATE asignacion SET estado = :resultado, respondido_en = now()"
            " WHERE pedido_id = :pedido AND repartidor_id = :repartidor"
            " AND estado = 'PENDIENTE'",
            resultado=resultado,
            pedido=pedido_id,
            repartidor=repartidor_id,
        )

        if resultado == "ACEPTADA":
            # Repartidor y estado en la misma sentencia: si el pedido ya no
            # esta CREADO (por ejemplo, se cancelo), no se le asigna a nadie.
            if _cambiar_estado(pedido_id, "ASIGNADO", repartidor_id):
                return {"estado": "ASIGNADO", "repartidor_id": repartidor_id}
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
