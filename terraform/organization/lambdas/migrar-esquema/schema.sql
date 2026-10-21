CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS comercio (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre    text NOT NULL,
    direccion text NOT NULL,
    ubicacion geography(Point, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS producto (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comercio_id bigint NOT NULL REFERENCES comercio (id),
    nombre      text NOT NULL,
    precio      integer NOT NULL CHECK (precio >= 0),
    disponible  boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS producto_comercio_idx ON producto (comercio_id);

CREATE TABLE IF NOT EXISTS cliente (
    id        text PRIMARY KEY,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido (
    id                uuid PRIMARY KEY,
    cliente_id        text NOT NULL REFERENCES cliente (id),
    comercio_id       bigint NOT NULL REFERENCES comercio (id),
    estado            text NOT NULL DEFAULT 'CREADO'
                      CHECK (estado IN ('CREADO', 'ASIGNADO', 'ENTREGADO', 'CANCELADO')),
    direccion_entrega text NOT NULL,
    ubicacion_entrega geography(Point, 4326) NOT NULL,
    total             integer NOT NULL CHECK (total >= 0),
    creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedido_cliente_idx ON pedido (cliente_id);

CREATE TABLE IF NOT EXISTS pedido_item (
    pedido_id       uuid NOT NULL REFERENCES pedido (id),
    producto_id     bigint NOT NULL REFERENCES producto (id),
    cantidad        integer NOT NULL CHECK (cantidad > 0),
    precio_unitario integer NOT NULL CHECK (precio_unitario >= 0),
    PRIMARY KEY (pedido_id, producto_id)
);

CREATE TABLE IF NOT EXISTS pedido_evento (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id uuid NOT NULL REFERENCES pedido (id),
    estado    text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedido_evento_pedido_idx ON pedido_evento (pedido_id);

CREATE TABLE IF NOT EXISTS repartidor (
    id         text PRIMARY KEY,
    disponible boolean NOT NULL DEFAULT false,
    creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repartidor_posicion (
    repartidor_id  text PRIMARY KEY REFERENCES repartidor (id),
    ubicacion      geography(Point, 4326) NOT NULL,
    actualizado_en timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS repartidor_posicion_gist
    ON repartidor_posicion USING gist (ubicacion);

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS repartidor_id text REFERENCES repartidor (id);

CREATE TABLE IF NOT EXISTS asignacion (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id     uuid NOT NULL REFERENCES pedido (id),
    repartidor_id text NOT NULL REFERENCES repartidor (id),
    task_token    text NOT NULL,
    estado        text NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'VENCIDA')),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    respondido_en timestamptz,
    UNIQUE (pedido_id, repartidor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS asignacion_una_pendiente
    ON asignacion (repartidor_id) WHERE estado = 'PENDIENTE';

CREATE TABLE IF NOT EXISTS calificacion (
    pedido_id  uuid PRIMARY KEY REFERENCES pedido (id),
    puntaje    smallint NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
    comentario text,
    creado_en  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS comprobante text;

CREATE INDEX IF NOT EXISTS pedido_repartidor_idx ON pedido (repartidor_id);
