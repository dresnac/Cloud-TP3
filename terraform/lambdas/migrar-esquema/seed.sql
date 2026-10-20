-- Datos de prueba. Idempotente: correrlo de nuevo no duplica filas.
INSERT INTO comercio (nombre, direccion, ubicacion)
SELECT v.nombre, v.direccion, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography
FROM (VALUES
    ('Pizzeria Demo Centro',   'Av. Corrientes 1300, CABA', -58.3865, -34.6037),
    ('Sushi Demo Palermo',     'Thames 1800, CABA',         -58.4270, -34.5870),
    ('Parrilla Demo Belgrano', 'Cabildo 2000, CABA',        -58.4590, -34.5610)
) AS v(nombre, direccion, lng, lat)
WHERE NOT EXISTS (SELECT 1 FROM comercio c WHERE c.nombre = v.nombre);

INSERT INTO producto (comercio_id, nombre, precio)
SELECT c.id, p.nombre, p.precio
FROM (VALUES
    ('Pizzeria Demo Centro',   'Muzzarella grande',   12000),
    ('Pizzeria Demo Centro',   'Fugazzeta',           13500),
    ('Sushi Demo Palermo',     'Combinado 15 piezas', 18000),
    ('Sushi Demo Palermo',     'Rolls de salmon',      9500),
    ('Parrilla Demo Belgrano', 'Bife de chorizo',     16000),
    ('Parrilla Demo Belgrano', 'Provoleta',            6000)
) AS p(comercio, nombre, precio)
JOIN comercio c ON c.nombre = p.comercio
WHERE NOT EXISTS (
    SELECT 1 FROM producto x WHERE x.comercio_id = c.id AND x.nombre = p.nombre
);
