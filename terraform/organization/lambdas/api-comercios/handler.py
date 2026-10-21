import api
import db


def handler(event, context):
    ruta = event["routeKey"]

    if ruta == "GET /comercios":
        comercios = db.consultar(
            "SELECT id, nombre, direccion,"
            " ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lng"
            " FROM comercio ORDER BY nombre"
        )
        return api.respuesta(200, comercios)

    if ruta == "GET /comercios/{id}/productos":
        try:
            comercio_id = int(event["pathParameters"]["id"])
        except ValueError:
            return api.respuesta(400, {"error": "id invalido"})

        if not db.consultar("SELECT 1 FROM comercio WHERE id = :id", id=comercio_id):
            return api.respuesta(404, {"error": "comercio no encontrado"})

        productos = db.consultar(
            "SELECT id, nombre, precio FROM producto"
            " WHERE comercio_id = :id AND disponible ORDER BY nombre",
            id=comercio_id,
        )
        return api.respuesta(200, productos)

    return api.respuesta(404, {"error": "ruta no encontrada"})
    