import db


class PedidoInvalido(Exception):
    pass


def handler(event, context):
    pedido_id = event["pedido_id"]
    items = event["items"]
    entrega = event["entrega"]

    with db.transaccion():
        if db.consultar("SELECT 1 FROM pedido WHERE id = :id", id=pedido_id):
            return {"pedido_id": pedido_id}

        productos = db.consultar(
            "SELECT id, precio FROM producto"
            " WHERE id = ANY(:ids) AND comercio_id = :comercio AND disponible",
            ids=[i["producto_id"] for i in items],
            comercio=event["comercio_id"],
        )
        precios = {p["id"]: p["precio"] for p in productos}
        faltan = {i["producto_id"] for i in items} - precios.keys()
        if faltan:
            raise PedidoInvalido(f"productos no disponibles: {sorted(faltan)}")

        total = sum(precios[i["producto_id"]] * i["cantidad"] for i in items)

        db.consultar(
            "INSERT INTO cliente (id) VALUES (:id) ON CONFLICT DO NOTHING",
            id=event["cliente_id"],
        )
        db.consultar(
            "INSERT INTO pedido (id, cliente_id, comercio_id, direccion_entrega,"
            " ubicacion_entrega, total) VALUES (:id, :cliente, :comercio, :direccion,"
            " ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :total)",
            id=pedido_id,
            cliente=event["cliente_id"],
            comercio=event["comercio_id"],
            direccion=entrega["direccion"],
            lng=entrega["lng"],
            lat=entrega["lat"],
            total=total,
        )
        for item in items:
            db.consultar(
                "INSERT INTO pedido_item (pedido_id, producto_id, cantidad, precio_unitario)"
                " VALUES (:pedido, :producto, :cantidad, :precio)",
                pedido=pedido_id,
                producto=item["producto_id"],
                cantidad=item["cantidad"],
                precio=precios[item["producto_id"]],
            )
        db.consultar(
            "INSERT INTO pedido_evento (pedido_id, estado) VALUES (:id, 'CREADO')",
            id=pedido_id,
        )

    return {"pedido_id": pedido_id, "total": total}
    