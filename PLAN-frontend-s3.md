# Plan: frontend en S3 con static website hosting (sin CloudFront)

## Objetivo

Publicar el frontend (`frontend/`, React + Vite) en un bucket S3 con static website hosting, creado con Terraform, y dejar un script que lo compile y lo suba. Sin CloudFront.

## Qué hay hoy

### Terraform (`terraform/`)

- **`storage.tf`**: un solo bucket, `aws_s3_bucket.archivos`, privado: public access block en `true`, policy `SoloTLS` (deniega todo sin HTTPS), versionado, cifrado, lifecycle y CORS solo `POST`. Guarda comprobantes e histórico de posiciones.
- **`api.tf`**: API Gateway HTTP con CORS tomado de `var.cors_origenes`.
- **`variables.tf`**: `cors_origenes` por defecto es `["http://localhost:5173"]`. La validación acepta `https?://host[:puerto]`, sin barra final ni comodines. Lo usan la API y el CORS del bucket de archivos.
- **`outputs.tf`**: ya expone `api_url`, `cognito_user_pool_id`, `cognito_client_ids`, `asignacion_timeout_segundos` y `bucket_archivos`.
- **`providers.tf` / `versions.tf`**: región `us-east-1` o `us-west-2`, provider `aws ~> 6.28`.
- **CI** (`.github/workflows/terraform.yml`): `fmt -check`, `init -backend=false` y `validate`. El código nuevo tiene que pasar `terraform fmt`.

### Frontend (`frontend/`)

- Vite con `BrowserRouter`: las rutas `/cliente` y `/repartidor` necesitan que el hosting devuelva `index.html` ante un 404.
- La configuración (`VITE_API_URL`, `VITE_USER_POOL_ID`, etc.) se **incorpora al bundle en el build**, desde `.env.local`.
- `npm run config` (`scripts/config-desde-terraform.mjs`) genera ese `.env.local` leyendo `terraform output -json`.
- `vite.config.js` fija el puerto 5173, que es el origen permitido por CORS en desarrollo.
- `RepartidorApp.jsx` ya contempla un contexto no seguro (`window.isSecureContext && "geolocation" in navigator`). Con HTTP el GPS queda deshabilitado, pero la app no se rompe (ver Riesgos).

### Restricciones del Learner Lab (`scp-learner-lab.md`)

El SCP **deniega `s3:GetBucketObjectLockConfiguration`**, y el provider la ejecuta en cada lectura de cualquier `aws_s3_bucket`. Todo bucket nuevo declarado con ese recurso tiene el mismo problema que `archivos`.

## Decisión de diseño

Hay que elegir cómo declarar el bucket del frontend, porque es el punto crítico del plan:

| Opción | Efecto |
|---|---|
| **A. `aws_s3_bucket` normal** | Falla igual que `archivos` por el SCP. Sirve solo si se resuelve ese problema en general (opciones 1–4 de `scp-learner-lab.md`). |
| **B. Un solo mecanismo para ambos buckets** | Si el equipo adopta `terraform_data` con AWS CLI (opción 2) o `awscc` (opción 3) para `archivos`, el bucket del frontend usa el mismo mecanismo. |

**Recomendación:** escribir el bucket del frontend como `aws_s3_bucket` (opción A) y que siga la misma suerte que `archivos`. Así el código es idiomático y, cuando se decida qué hacer con el SCP, se cambia el recurso del bucket en un solo lugar. Hasta entonces se aplica con el mismo procedimiento de parche documentado.

Las configuraciones auxiliares (`website_configuration`, `public_access_block`, `bucket_policy`) no leen el object lock. Con la opción 2 siguen siendo recursos normales que apuntan al bucket por nombre.

## Cambios en Terraform

Archivo nuevo: **`terraform/frontend.tf`**.

```hcl
resource "aws_s3_bucket" "frontend" {
  bucket_prefix = "${var.proyecto}-frontend-"
  force_destroy = true
}

# Un sitio web publico necesita desactivar el bloqueo de acceso publico.
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  # BrowserRouter: una URL como /cliente no existe como objeto, S3 responde 404
  # y devuelve index.html para que el router del frontend resuelva la ruta.
  error_document {
    key = "index.html"
  }
}

data "aws_iam_policy_document" "frontend" {
  statement {
    sid       = "LecturaPublica"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json

  # La policy publica falla si el bloqueo todavia esta activo.
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
```

Notas:

- **No** copiar la policy `SoloTLS` de `archivos`: el endpoint de website de S3 solo habla HTTP y esa policy lo bloquearía.
- Cifrado en reposo: S3 ya cifra por defecto con SSE-S3, así que no hace falta declararlo.
- Sin versionado ni lifecycle: el contenido se regenera con cada build.
- `force_destroy = true` para que `terraform destroy` pueda vaciar el bucket.

### Outputs (`terraform/outputs.tf`)

```hcl
output "bucket_frontend" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_url" {
  description = "URL publica del frontend (HTTP: el endpoint de website de S3 no soporta HTTPS)."
  value       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
}
```

### CORS: incluir el origen del website

La API y el bucket de comprobantes solo aceptan `http://localhost:5173`. El navegador, desde la URL del website, quedaría bloqueado por CORS. Hay que sumar ese origen sin pedirle al usuario que lo escriba a mano:

```hcl
# frontend.tf
locals {
  origenes_cors = concat(
    var.cors_origenes,
    ["http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"],
  )
}
```

Y en `api.tf` y `storage.tf` reemplazar `var.cors_origenes` por `local.origenes_cors` (`api.tf:8` y el `cors_rule` de `aws_s3_bucket_cors_configuration.archivos`).

**No hay ciclo de dependencias:** el bucket del frontend no depende de la API ni de `archivos`. La URL del frontend se conoce antes de crear la API.

La validación de `cors_origenes` se mantiene, porque ahora solo se aplica a lo que ingresa el usuario.

## Publicación del frontend

El build necesita las salidas de Terraform (`api_url`, IDs de Cognito), y Vite las incorpora al bundle. Por eso **la subida no va dentro de Terraform**: va en un script que se corre después del `apply`. Hacerlo con `aws_s3_object` + `fileset` obligaría a compilar antes de conocer esas salidas.

### Script nuevo: `scripts/publicar-frontend.sh`

Mismo estilo que `scripts/verificar-apply.sh` (bash, `TF="terraform -chdir=terraform"`). Pasos:

1. Leer `bucket_frontend` y `frontend_url` de `terraform output`.
2. `cd frontend && npm ci && npm run config && npm run build` (`config` regenera `.env.local` con los outputs actuales).
3. Subir con caché diferenciada:
   ```bash
   # Assets con hash en el nombre: cacheables por mucho tiempo
   aws s3 sync dist s3://$BUCKET --delete --exclude index.html \
     --cache-control "public,max-age=31536000,immutable"
   # index.html nunca cacheado: es el que apunta a los assets nuevos
   aws s3 cp dist/index.html s3://$BUCKET/index.html \
     --cache-control "no-cache" --content-type "text/html"
   ```
4. Imprimir `frontend_url` y comprobar que responde: `curl -sI "$URL" | head -1` y una ruta profunda (`$URL/cliente`), que debe devolver `index.html` (el código HTTP será 404, ver Riesgos).

Requisitos: credenciales del Lab exportadas (como en `verificar-apply.sh`), Node y AWS CLI.

## Orden de ejecución

1. Resolver el bucket frente al SCP (ver Decisión de diseño). Si se usa el parche actual, aplicar con el procedimiento de `scp-learner-lab.md`.
2. Agregar `frontend.tf`, los outputs y el cambio de CORS.
3. `terraform fmt -recursive` y `terraform validate` (lo mismo que corre el CI).
4. `terraform plan` y `terraform apply`. Con el parche del SCP, ambos con `-refresh=false`.
5. `./scripts/publicar-frontend.sh`.
6. Abrir `frontend_url` y probar.

## Verificación

- `terraform output frontend_url` devuelve `http://<bucket>.s3-website-us-east-1.amazonaws.com`.
- La URL raíz muestra la pantalla "Delivery" con las dos apps.
- Entrar directo a `<frontend_url>/cliente` carga la app (no una página XML de error de S3).
- Login con un usuario demo (`terraform output -json usuarios_demo`): sin errores de CORS en la consola del navegador.
- Listar comercios (`GET /comercios`) funciona desde la URL de S3.
- Subir un comprobante (POST firmado al bucket `archivos`) funciona, lo que confirma el CORS del bucket de archivos.
- Recargar la página en una ruta profunda no rompe la app.

## Riesgos y puntos a verificar en el Lab

| Riesgo | Detalle | Mitigación |
|---|---|---|
| **SCP sobre `GetBucketObjectLockConfiguration`** | El bucket nuevo falla igual que `archivos`. | Ver Decisión de diseño. |
| **Block Public Access a nivel de cuenta** | Si el Lab lo tiene activado a nivel de cuenta, la policy pública se rechaza aunque el bucket lo permita. | Probar `aws s3control get-public-access-block --account-id <id>`. Si está bloqueado, no hay website público posible: la alternativa es servir con CloudFront u otra opción, que queda fuera de este plan. |
| **Solo HTTP** | El endpoint de website no soporta HTTPS. El tráfico, incluido el login, no va cifrado entre el navegador y S3 (los assets son públicos; las llamadas a API Gateway siguen siendo HTTPS). | Aceptable para un TP. Documentarlo en la entrega y mencionar CloudFront + ACM como mejora de producción. |
| **GPS del repartidor** | `navigator.geolocation` exige contexto seguro (HTTPS o localhost). En HTTP, `gpsDisponible` es falso y no se envían posiciones reales. | `RepartidorApp.jsx` ya lo contempla. Para la demo, mostrar la app del repartidor con `localhost` (`npm run dev`) o simular posiciones. |
| **Login Cognito en HTTP** | `amazon-cognito-identity-js` usa SRP con `getRandomValues`, que funciona en HTTP. No usa `crypto.subtle`. | Probar el login en la primera publicación. |
| **404 en rutas profundas** | Con `error_document = index.html`, S3 devuelve el HTML correcto pero con código 404. Los navegadores lo cargan igual. | Aceptable. Evitarlo requeriría CloudFront. |
| **URL cambia al recrear el bucket** | `bucket_prefix` genera un nombre nuevo, y con él cambia el origen CORS. | El origen se calcula desde el recurso (`local.origenes_cors`), así que se actualiza solo con el `apply`. Hay que volver a correr el script de publicación. |
| **Credenciales rotan cada sesión** | El script depende de las credenciales vigentes del Lab. | Volver a exportarlas antes de publicar. No guardarlas en CI. |

## Fuera de alcance

- CloudFront, dominio propio, ACM y WAF.
- Publicación automática desde GitHub Actions (el CI actual solo valida Terraform, y las credenciales del Lab rotan).
- Resolver el SCP en general, que se decide con las opciones de `scp-learner-lab.md`.
