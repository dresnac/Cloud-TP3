import api
import db


def handler(event, context):
    if "repartidor" not in api.grupos(event):
        return api.respuesta(403, {"error": "solo para repartidores"})

    repartidor_id = api.claims(event)["sub"]
    ruta = event["routeKey"]

    if ruta == "PUT /repartidores/me/estado":
        try:
            disponible = api.cuerpo_json(event)["disponible"]
        except (ValueError, KeyError, TypeError):
            return api.respuesta(400, {"error": "falta 'disponible'"})
        if not isinstance(disponible, bool):
            return api.respuesta(400, {"error": "'disponible' tiene que ser true o false"})

        db.consultar(
            "INSERT INTO repartidor (id, disponible) VALUES (:id, :disponible)"
            " ON CONFLICT (id) DO UPDATE SET disponible = EXCLUDED.disponible",
            id=repartidor_id,
            disponible=disponible,
        )
        return api.respuesta(200, {"disponible": disponible})

    if ruta == "GET /asignaciones/pendientes":
        pendientes = db.consultar(
            "SELECT a.id, a.pedido_id, a.task_token, a.creado_en,"
            " c.nombre AS comercio, c.direccion AS direccion_comercio,"
            " p.direccion_entrega, p.total"
            " FROM asignacion a"
            " JOIN pedido p ON p.id = a.pedido_id"
            " JOIN comercio c ON c.id = p.comercio_id"
            " WHERE a.repartidor_id = :id AND a.estado = 'PENDIENTE'",
            id=repartidor_id,
        )
        return api.respuesta(200, pendientes)

    return api.respuesta(404, {"error": "ruta no encontrada"})
    