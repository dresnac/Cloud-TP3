# TP3 — Plataforma de delivery en AWS con Terraform

**82.08 Cloud Computing**

El módulo raíz de Terraform está en [`terraform/organization/`](terraform/organization/) y el módulo propio en [`terraform/modules/`](terraform/modules/). Hay un archivo por capa de la arquitectura: `network`, `database`, `auth`, `api`, `compute`, `orchestration`, `messaging`, `streaming`, `storage`, `monitoring` e `iam`. Las variables, los outputs, los locals, los providers y las versiones están en archivos separados.

---

## 1. Módulos

### Módulo propio: `terraform/modules/lambda_function`

Encapsula todo lo que necesita una Lambda del proyecto. Se usa **19 veces**: 18 en [`compute.tf`](terraform/organization/compute.tf) y 1 en [`recursos-base.tf`](terraform/organization/recursos-base.tf). Así, cada función queda declarada en unas pocas líneas.

| Recurso que crea | Para qué |
|---|---|
| `archive_file.zip` | Empaqueta `lambdas/<nombre>/` en `.build/<nombre>.zip` (excluye `__pycache__`) |
| `aws_cloudwatch_log_group.this` | Log group `/aws/lambda/<nombre>` con retención de 7 días |
| `time_sleep.logs` | Al destruir, espera 60 s antes de borrar el log group (ver [sección 4](#4-lambda-recursos-base)) |
| `aws_lambda_function.this` | La función: Python 3.12, handler `handler.handler`, redeploy automático cuando cambia el código (`source_code_hash`) |

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `nombre` | `string` | — | Nombre de la función y del zip |
| `source_dir` | `string` | — | Carpeta con el `handler.py` |
| `role_arn` | `string` | — | Rol de ejecución (`LabRole`) |
| `timeout` | `number` | `10` | Segundos |
| `environment` | `map(string)` | `{}` | Variables de entorno; si está vacío no se crea el bloque |
| `vpc_config` | `object` | `null` | Subredes y security groups; `null` = la función corre fuera de la VPC |
| `layers` | `list(string)` | `[]` | ARNs de layers; tiene una validación de hasta 5, que es el límite de Lambda |

Outputs: `function_name`, `arn` e `invoke_arn`. Los consumen API Gateway, Step Functions, los event source mappings y `aws_lambda_invocation`.

### Módulo externo: `terraform-aws-modules/vpc/aws` (`~> 6.7`)

Está en [`network.tf`](terraform/organization/network.tf) y crea la VPC con 2 AZ y dos niveles de subredes privadas. Las subredes `app` alojan las Lambdas que acceden a RDS y las subredes `datos` alojan RDS, con su propio subnet group y una NACL dedicada. Las reglas de la NACL se generan con una expresión `for` sobre las subredes `app`: solo permiten tráfico entrante al 5432 y la respuesta por puertos efímeros. No hay Internet Gateway ni NAT (`create_igw = false`, `enable_nat_gateway = false`). Las Lambdas de la VPC llegan a Secrets Manager y a S3 por VPC endpoints.

---

## 2. Funciones de Terraform

| Función | Dónde | Para qué |
|---|---|---|
| `jsonencode` | `api.tf`, `database.tf`, `messaging.tf`, `compute.tf`, `recursos-base.tf` | Formato de los access logs, secreto de RDS, redrive policy de SQS, input de las invocaciones |
| `jsondecode` | `recursos-base.tf`, `outputs.tf` | Leer la respuesta de `recursos-base` y de `migrar-esquema` |
| `templatefile` | `orchestration.tf` | Generar las definiciones ASL de las dos state machines a partir de `statemachines/*.tftpl` |
| `merge` | `compute.tf` | Sumar variables propias a `local.entorno_db`, que comparten todas las Lambdas que usan RDS |
| `concat` | `compute.tf` | Combinar las layers de base de datos con la layer de API |
| `cidrsubnet` | `locals.tf` | Calcular las subredes /24 `app` (10.0.10+i) y `datos` (10.0.20+i) a partir de `vpc_cidr` |
| `slice` | `locals.tf` | Tomar las 2 primeras AZ disponibles |
| `range` / `length` | `locals.tf` | Generar una subred por AZ |
| `toset` | `locals.tf`, `compute.tf` | Roles de Cognito y layers como conjuntos para `for_each` |
| `values` | `api.tf`, `variables.tf` | Audiencias del autorizador JWT (IDs de los App Clients); validar los grupos de `usuarios_demo` |
| `replace` | `database.tf` | Nombre de la base derivado de `proyecto` (los guiones pasan a `_`) |
| `tostring` | `compute.tf` | Pasar números y booleanos como variables de entorno |
| `filesha256` | `compute.tf` | Volver a correr la migración cuando cambia `schema.sql` o `seed.sql` |
| `strcontains` | `compute.tf` | Postcondición: el bundle de CA de RDS descargado es un certificado |
| `can` + `regex` / `cidrhost` | `variables.tf` | Validar `proyecto`, `alerta_email`, `cors_origenes` y que `vpc_cidr` sea un CIDR válido |
| `contains`, `alltrue`, `endswith` | `variables.tf` | Validar la región, los grupos de usuarios demo y que la VPC sea /16 |

---

## 3. Meta-argumentos

### `for_each`

| Dónde | Itera sobre |
|---|---|
| `auth.tf` | `local.roles` (un App Client y un grupo de Cognito por app) y `var.usuarios_demo` (contraseña, usuario y pertenencia a grupo por cada usuario de prueba) |
| `api.tf` | `local.lambdas_api` (integración y permiso de invocación por Lambda) y `local.rutas` (una ruta del API por entrada) |
| `compute.tf` | Las layers `db` y `api` (zip + `aws_lambda_layer_version`) |
| `streaming.tf` | `local.consumidores_posiciones`: los dos consumidores del stream, cada uno con su posición inicial, tamaño de lote, ventana y edad máxima |
| `monitoring.tf` | `local.colas_con_alarma` y `local.workflows` (una alarma por cola y por state machine) |
| Módulo `lambda_function` | Bloques `dynamic` de `environment` y `vpc_config`, que solo se generan si se pasaron |

### `count`

[`monitoring.tf`](terraform/organization/monitoring.tf): la suscripción por email al topic de alertas se crea solo si `alerta_email` no está vacía (`count = var.alerta_email == "" ? 0 : 1`).

### `depends_on`

Se usa para las dependencias que Terraform no puede inferir de las referencias:

| Dónde | Por qué |
|---|---|
| `compute.tf` (`migrar_esquema`) | La migración necesita RDS, el secreto, el endpoint de Secrets Manager y las reglas de security group ya creadas |
| `streaming.tf` | Kinesis no invoca a `actualizar-posicion` hasta que exista la tabla que escribe, es decir, hasta que corrió la migración |
| `storage.tf` | El lifecycle de S3 necesita el versionado activo; la bucket policy va después del public access block |
| Módulo `lambda_function` | La función se crea después de su log group (vía `time_sleep`) |

### `lifecycle`

| Dónde | Regla | Por qué |
|---|---|---|
| `network.tf`, `database.tf` | `create_before_destroy` en los security groups | Reemplazar un SG sin dejar sin reglas a los recursos que lo usan |
| `database.tf` | `precondition` | RDS necesita al menos 2 subredes de datos |
| `compute.tf` (`data.http.rds_ca`) | `postcondition` | Falla temprano si no se pudo descargar el bundle de CA de RDS |
| `recursos-base.tf` | `lifecycle_scope = "CRUD"` (argumento de `aws_lambda_invocation`) | La invocación corre en create, update y **destroy** |

---

## 4. Lambda `recursos-base`

El Learner Lab tiene un SCP (Service Control Policy de AWS Academy) que niega dos llamadas que el provider de AWS hace siempre y que no se pueden desactivar:

| Recurso | Llamada denegada |
|---|---|
| `aws_s3_bucket` | `s3:GetBucketObjectLockConfiguration`, en cada lectura del bucket. Después del primer apply, todo `plan` falla |
| `aws_kinesis_stream` | `kinesis:IncreaseStreamRetentionPeriod`, al crear el stream. El stream queda a medias y sin cifrado |

Por eso el bucket `archivos` y el stream `posiciones` no se declaran como recursos de Terraform. Los crea una Lambda, [`lambdas/recursos-base/handler.py`](terraform/organization/lambdas/recursos-base/handler.py), que solo hace las llamadas permitidas. Terraform la invoca como un *custom resource*:

```hcl
resource "aws_lambda_invocation" "recursos_base" {
  function_name   = module.recursos_base.function_name
  lifecycle_scope = "CRUD"
  input = jsonencode({ bucket = ..., stream = ..., shards = 1, kms_key = "alias/aws/kinesis", tags = ... })
}
```

| Acción de Terraform | Qué hace la Lambda |
|---|---|
| **create** | Crea el stream (1 shard, `PROVISIONED`, cifrado KMS) y el bucket. Si ya existen, no falla. Las etiquetas (`default_tags` del provider) las aplica si el Lab lo permite |
| **update** | Si cambió el nombre del bucket o del stream, borra el anterior y crea el nuevo |
| **delete** | Vacía el bucket (todas las versiones y delete markers) y lo borra; borra el stream |

La Lambda devuelve los nombres y ARNs. [`recursos-base.tf`](terraform/organization/recursos-base.tf) los expone como `local.bucket_archivos`, `local.bucket_archivos_arn`, `local.stream_posiciones` y `local.stream_posiciones_arn`. El resto del código usa esos locals, y la configuración del bucket (versionado, cifrado, lifecycle, CORS, policy y bloqueo de acceso público) sigue en Terraform, en [`storage.tf`](terraform/organization/storage.tf). El nombre del bucket es único porque lleva un sufijo `random_id`.

**`time_sleep` en el módulo de Lambda.** Lambda escribe los logs unos segundos después de cada invocación. Si el log group ya se borró, lo vuelve a crear fuera de Terraform. Como `recursos-base` se invoca durante el `destroy`, eso rompía el siguiente `apply`. El `time_sleep` hace que el log group se borre 60 s después que la función.

---

## 5. Guía de ejecución

Hay dos formas de desplegar. **No mezclarlas sobre la misma cuenta**: cada una guarda su propio estado de Terraform, y un apply local no ve lo que creó el workflow (ni al revés).

### Requisitos

- Una sesión activa de **AWS Academy Learner Lab**: el código usa el rol `LabRole` y la región `us-east-1`.
- Para la opción B: Terraform **>= 1.10** (el CI usa 1.16.4), AWS CLI y, para el frontend, Node.js.

### Opción A: desde GitHub Actions (recomendada)

1. **Secrets.** En el Learner Lab, *Start Lab* → *AWS Details* → *AWS CLI*. Cargar los tres valores en *Settings → Secrets and variables → Actions* del repositorio:
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_SESSION_TOKEN`. Vencen con la sesión del Lab: actualizarlos antes de cada ejecución.
2. **Desplegar.** *Actions* → **deploy** → *Run workflow* → `apply`. Tarda unos 15 minutos (RDS es lo más lento).
   El workflow prepara el estado remoto, aplica el plan y corre una prueba de humo: rechazo sin token (401), login de Cognito con el usuario demo y catálogo de comercios y productos leído desde RDS.
3. **Resultado.** El resumen de la ejecución muestra la URL del API y el User Pool. El artefacto **`frontend-config`** trae el `.env.local` del frontend (solo configuración pública).
4. **Frontend.** Copiar `.env.local` a `frontend/` y:

   ```bash
   cd frontend
   npm ci
   npm run dev      # http://localhost:5173
   ```

   Usuarios demo: `cliente.demo@example.com` y `repartidor.demo@example.com`. Sus contraseñas no se imprimen en los logs; para leerlas, ver [Contraseñas demo](#contraseñas-demo).
5. **Destruir.** *Run workflow* → `destroy`. Se borran todos los recursos del TP y se conserva el bucket del estado.

`plan` muestra los cambios sin aplicar nada.

### Opción B: desde una terminal

1. **Credenciales.** Copiar el bloque de *AWS Details → AWS CLI* en `~/.aws/credentials`, o exportar las variables:

   ```bash
   export AWS_ACCESS_KEY_ID=...
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_SESSION_TOKEN=...
   export AWS_REGION=us-east-1
   ```

2. **Variables (opcional).** Todas tienen default:

   ```bash
   cp terraform/organization/terraform.tfvars.example terraform/organization/terraform.tfvars
   ```

3. **Init, plan y apply.** Al final del apply, Terraform invoca `migrar-esquema`, que crea el esquema y carga los datos de prueba.

   ```bash
   cd terraform/organization
   terraform init
   terraform plan -out=tfplan
   terraform apply tfplan
   ```

4. **Outputs.**

   ```bash
   terraform output                       # URL del API, User Pool, App Clients, bucket, stream...
   terraform output migracion             # resultado de la migracion
   terraform output -json usuarios_demo   # credenciales de los usuarios de prueba
   ```

5. **Frontend.**

   ```bash
   cd frontend
   npm ci
   npm run config   # genera .env.local con los outputs de Terraform
   npm run dev
   ```

6. **Verificar (opcional).** Desde la raíz del repo, con las mismas credenciales: `./scripts/verificar-apply.sh`.

7. **Destruir.** `terraform destroy` desde `terraform/organization`. `recursos-base` vacía y borra el bucket y el stream como parte del destroy.

### Contraseñas demo

Se generan con `random_password` y quedan solo en el estado. Para leerlas de un despliegue hecho con el workflow, desde una terminal con las credenciales del mismo Lab:

```bash
cd terraform/organization
cat > override.tf <<'HCL'
terraform {
  backend "s3" {}
}
HCL
cuenta=$(aws sts get-caller-identity --query Account --output text)
terraform init -input=false \
  -backend-config="bucket=itba-cloud-2026q2-g1-tfstate-${cuenta}-us-east-1" \
  -backend-config='key=delivery/terraform.tfstate' \
  -backend-config='region=us-east-1' \
  -backend-config='encrypt=true' \
  -backend-config='use_lockfile=true'
terraform output -json usuarios_demo
```

`override.tf` está en `.gitignore`. No copiar las contraseñas en issues, PR ni logs.

---

## 6. Pipelines de GitHub Actions

| Workflow | Cuándo corre | Qué hace |
|---|---|---|
| [`terraform.yml`](.github/workflows/terraform.yml) | Cada PR y cada push a `main` | `fmt`, `init -backend=false`, `validate` y, si hay secrets, `plan` contra un estado vacío. En un PR desde un fork GitHub no entrega secrets: el plan se omite con un aviso y el job queda en verde. |
| [`deploy.yml`](.github/workflows/deploy.yml) | Manual (*Run workflow*) | `plan`, `apply` o `destroy` con estado remoto, prueba de humo y artefacto del frontend. Ver [Opción A](#opción-a-desde-github-actions-recomendada). |
| [`tfsec.yaml`](.github/workflows/tfsec.yaml) | Cada PR | Análisis de seguridad del código Terraform. Ver [Decisiones de seguridad](#decisiones-de-seguridad). |
| [`terraform-docs.yml`](.github/workflows/terraform-docs.yml) | Cada PR | Documentación de los módulos. En un PR desde un fork genera sin empujar cambios. |
| [`terraform-format.yml`](.github/workflows/terraform-format.yml) | Cada PR | `terraform fmt -check` con comentario en el PR. |

### Estado remoto del despliegue

[`.github/scripts/terraform-backend.sh`](.github/scripts/terraform-backend.sh) prepara, antes de cada ejecución de `deploy`:

- **Bucket de estado** `itba-cloud-2026q2-g1-tfstate-<cuenta>-us-east-1`: privado (bloqueo de acceso público), cifrado (SSE-S3) y versionado, así que una versión dañada del estado se puede recuperar. Se crea con la AWS CLI y no con Terraform: es el lugar donde Terraform guarda su propio estado, y además el Learner Lab niega la llamada que el provider hace sobre todo bucket (ver [sección 4](#4-lambda-recursos-base)).
- **Bloqueo nativo de S3** (`use_lockfile`): dos ejecuciones nunca escriben el estado a la vez. Además, el workflow encola las ejecuciones y nunca cancela un apply en curso.
- **Protección contra duplicados:** si la cuenta ya tiene recursos `delivery` pero el estado remoto está vacío (por ejemplo, de un apply local), el workflow se detiene en vez de crear un segundo despliegue.

El estado y los planes nunca se publican como artefactos: contienen las contraseñas generadas.

### Decisiones de seguridad

tfsec no reporta hallazgos abiertos. Cada regla que se acepta está marcada con `#tfsec:ignore:<regla>` en el recurso, junto con su justificación; no se desactiva el análisis.

| Regla | Recurso | Por qué se acepta |
|---|---|---|
| `aws-sns-enable-topic-encryption` | `alertas` | CloudWatch Alarms no puede publicar en un topic cifrado con la clave administrada `aws/sns`. Cifrarlo exigiría una CMK propia con key policy a medida. El topic solo transporta nombres y estados de alarmas. |
| `aws-sns-topic-encryption-use-cmk` | `estado_pedido` | Está cifrado con la clave administrada. Solo publican Step Functions y LabRole, que esa clave ya autoriza; una CMK no cambiaría quién puede leer. |
| `aws-rds-enable-deletion-protection` | RDS | El `destroy` del workflow tiene que poder borrar la base sin pasos manuales. En producción iría activado. |
| `aws-rds-enable-iam-auth` | RDS | Las Lambdas usan usuario y clave de Secrets Manager por el endpoint privado de la VPC; la autenticación IAM requiere permisos `rds-db:connect` que LabRole no permite configurar. |
| `aws-rds-enable-performance-insights` | RDS | No disponible para `db.t3.micro`. |
| `aws-ssm-secret-use-customer-key`, `aws-cloudwatch-log-group-customer-key` | Secreto de RDS, log groups | Cifrado con claves administradas. Una CMK no agrega control de acceso cuando todo corre con LabRole. |
| `aws-lambda-enable-tracing` | Módulo `lambda_function` | X-Ray necesita `xray:PutTraceSegments` en el rol de ejecución, y LabRole no se puede modificar. El seguimiento se hace con las ejecuciones de Step Functions y CloudWatch Logs. |

La retención de backups de RDS, que tfsec marcaba en 1 día, pasó a ser la variable `db_dias_backup` (7 días por defecto).
