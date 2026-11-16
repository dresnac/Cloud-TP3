import db


class PedidoInvalido(Exception):
    pass


def handler(event, context):
    pedido_id = event["pedido_id"]
    items = event["items"]
    entrega = event["entrega"]

    with db.transaccion():
        existente = db.consultar(
            "SELECT estado, total FROM pedido WHERE id = :id", id=pedido_id
        )
        if not existente:
            productos = db.consultar(
                "SELECT id, precio FROM producto"
                " WHERE id = ANY(:ids) AND comercio_id = :comercio AND disponible",
                ids=[i["producto_id"] for i in items],
                comercio=event["comercio_id"],
            )
            precios = {p["id"]: p["precio"] for p in productos}
            faltan = sorted({i["producto_id"] for i in items} - precios.keys())
            if not faltan:
                total = _crear(event, precios)
                return {"pedido_id": pedido_id, "total": total}

    # Fuera de la transaccion de arriba: una excepcion adentro haria rollback
    # y el rechazo no quedaria guardado.
    if existente:
        if existente[0]["estado"] == "RECHAZADO":
            # Reintento de una invocacion que ya habia rechazado el pedido.
            raise PedidoInvalido("pedido rechazado")
        # Reintento de Step Functions: se devuelve lo mismo que la primera
        # vez. Sin el total, el ResultSelector del estado CrearPedido falla
        # con States.Runtime y el pedido queda CREADO para siempre.
        return {"pedido_id": pedido_id, "total": existente[0]["total"]}

    # El rechazo queda persistido: la API ya devolvio 202 con este pedido_id
    # y el frontend lo va a consultar. Solo se puede guardar si el comercio
    # existe (FK); si no, el pedido no queda y cubre el timeout del frontend.
    with db.transaccion():
        _persistir_rechazo(event)
    raise PedidoInvalido(f"productos no disponibles: {faltan}")


def _crear(event, precios):
    entrega = event["entrega"]
    total = sum(precios[i["producto_id"]] * i["cantidad"] for i in event["items"])
    db.consultar(
        "INSERT INTO cliente (id) VALUES (:id) ON CONFLICT DO NOTHING",
        id=event["cliente_id"],
    )
    db.consultar(
        "INSERT INTO pedido (id, cliente_id, comercio_id, direccion_entrega,"
        " ubicacion_entrega, total) VALUES (:id, :cliente, :comercio, :direccion,"
        " ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :total)",
        id=event["pedido_id"],
        cliente=event["cliente_id"],
        comercio=event["comercio_id"],
        direccion=entrega["direccion"],
        lng=entrega["lng"],
        lat=entrega["lat"],
        total=total,
    )
    for item in event["items"]:
        db.consultar(
            "INSERT INTO pedido_item (pedido_id, producto_id, cantidad, precio_unitario)"
            " VALUES (:pedido, :producto, :cantidad, :precio)",
            pedido=event["pedido_id"],
            producto=item["producto_id"],
            cantidad=item["cantidad"],
            precio=precios[item["producto_id"]],
        )
    db.consultar(
        "INSERT INTO pedido_evento (pedido_id, estado) VALUES (:id, 'CREADO')",
        id=event["pedido_id"],
    )
    return total


def _persistir_rechazo(event):
    entrega = event["entrega"]
    db.consultar(
        "INSERT INTO cliente (id) VALUES (:id) ON CONFLICT DO NOTHING",
        id=event["cliente_id"],
    )
    db.consultar(
        "INSERT INTO pedido (id, cliente_id, comercio_id, direccion_entrega,"
        " ubicacion_entrega, total, estado)"
        " SELECT :id, :cliente, :comercio, :direccion,"
        " ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, 0, 'RECHAZADO'"
        " WHERE EXISTS (SELECT 1 FROM comercio WHERE id = :comercio)",
        id=event["pedido_id"],
        cliente=event["cliente_id"],
        comercio=event["comercio_id"],
        direccion=entrega["direccion"],
        lng=entrega["lng"],
        lat=entrega["lat"],
    )
    db.consultar(
        "INSERT INTO pedido_evento (pedido_id, estado)"
        " SELECT :id, 'RECHAZADO' WHERE EXISTS (SELECT 1 FROM pedido WHERE id = :id)",
        id=event["pedido_id"],
    )
