import os

import db

MAX_INTENTOS = int(os.environ["MAX_INTENTOS"])
RADIO_METROS = int(os.environ["RADIO_METROS"])


# Se agotaron las ofertas: el workflow cancela el pedido.
class OfertasAgotadas(Exception):
    pass


# No hay nadie cerca en este momento: el workflow reintenta durante
# asignacion_espera_segundos antes de cancelar.
class SinCandidatos(Exception):
    pass


def handler(event, context):
    pedido_id = event["pedido_id"]

    intentos = db.consultar(
        "SELECT count(*) AS n FROM asignacion WHERE pedido_id = :id", id=pedido_id
    )[0]["n"]
    if intentos >= MAX_INTENTOS:
        raise OfertasAgotadas(f"{intentos} ofertas sin aceptar")

    candidatos = db.consultar(
        "SELECT r.id AS repartidor_id,"
        " ST_Distance(rp.ubicacion, c.ubicacion)::int AS distancia_m"
        " FROM pedido p"
        " JOIN comercio c ON c.id = p.comercio_id"
        " JOIN repartidor r ON r.disponible"
        " JOIN repartidor_posicion rp ON rp.repartidor_id = r.id"
        " WHERE p.id = :pedido"
        " AND rp.actualizado_en > now() - interval '5 minutes'"
        " AND ST_DWithin(rp.ubicacion, c.ubicacion, :radio)"
        " AND NOT EXISTS (SELECT 1 FROM asignacion a"
        "   WHERE a.repartidor_id = r.id AND (a.pedido_id = p.id OR a.estado = 'PENDIENTE'))"
        " AND NOT EXISTS (SELECT 1 FROM pedido o"
        "   WHERE o.repartidor_id = r.id AND o.estado = 'ASIGNADO')"
        " ORDER BY rp.ubicacion <-> c.ubicacion"
        " LIMIT 1",
        pedido=pedido_id,
        radio=RADIO_METROS,
    )
    if not candidatos:
        raise SinCandidatos("no hay repartidores disponibles cerca")
    return candidatos[0]
    