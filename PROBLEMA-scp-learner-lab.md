# El SCP del Learner Lab bloquea el bucket y el stream de Kinesis

## Resumen

En el primer `terraform apply` en el Learner Lab, dos recursos fallaron por un **SCP** (Service Control Policy de la organización de AWS Academy). El SCP niega dos llamadas que el provider de AWS hace siempre y que no se pueden desactivar:

| Recurso | Llamada denegada | Cuándo la hace el provider |
|---|---|---|
| `aws_s3_bucket.archivos` | `s3:GetBucketObjectLockConfiguration` | En **cada lectura** del bucket: después de crearlo y en cada `plan`/`apply` |
| `aws_kinesis_stream.posiciones` | `kinesis:IncreaseStreamRetentionPeriod` | Solo al **crear** el stream |

Ninguna de las dos depende de nuestro código. Pasa con cualquier `aws_s3_bucket` y cualquier `aws_kinesis_stream`.

Hoy el stack está desplegado y la app funciona de punta a punta, pero gracias a un parche manual que no sirve para la entrega.

## El error en detalle

Los mensajes, recortados:

```
Error: reading S3 Bucket (delivery-archivos-...) object lock configuration:
  ... AccessDenied: ... is not authorized to perform: s3:GetBucketObjectLockConfiguration
  ... with an explicit deny in a service control policy

Error: increasing Kinesis Stream (delivery-posiciones) retention period:
  ... AccessDeniedException: ... is not authorized to perform: kinesis:IncreaseStreamRetentionPeriod
  ... with an explicit deny in a service control policy
```

### Bucket

Al leer un bucket, el provider consulta su configuración de object lock. Solo tolera los códigos que significan "la región no lo soporta" (`MethodNotAllowed`, `NotImplemented`). Un `AccessDenied` lo trata como error fatal.

Resultado: el bucket se crea, pero Terraform falla al leerlo enseguida, y a partir de ahí **todo `plan` falla**.

### Stream

Al crear el stream, el provider llama a `IncreaseStreamRetentionPeriod` siempre que `retention_period` tenga un valor. Su default es 24, así que lo tiene siempre.

La llamada es redundante, porque 24 h ya es lo que usa Kinesis, pero el SCP la niega y la creación queda a medias. Por eso el stream quedó **sin cifrado KMS**: ese paso venía después.

Una vez creado, leerlo no usa esa llamada, así que el stream **solo falla al crearse**.

### Efecto en cadena

En los dos casos el recurso existía en AWS, pero Terraform lo marcó como **tainted** (a destruir y recrear). Todo lo que dependía de ellos no se llegó a crear:

- la configuración del bucket: versionado, cifrado, bloqueo de acceso público, policy, lifecycle y CORS;
- los consumidores de Kinesis;
- las Lambdas `registrar-posicion`, `archivar-posiciones`, `url-comprobante`, `marcar-entregado` y `recibir-entrega`;
- las rutas de la API.

Cambiar la versión del provider no sirve: revisamos 4.67, 5.100 y la actual (6.x), y las tres se comportan igual.

## Parche temporal aplicado

Así quedó el despliegue actual:

```bash
cd terraform

# 1. Marcar los dos recursos como sanos. Existían en AWS: lo que falló fue una
#    lectura o un paso redundante.
terraform untaint aws_s3_bucket.archivos
terraform untaint aws_kinesis_stream.posiciones

# 2. Releer solo el stream, que no toca S3. El estado había quedado sin el ARN y
#    los consumidores no se podían planificar.
terraform apply -refresh-only -target=aws_kinesis_stream.posiciones

# 3. Aplicar el resto sin leer AWS: Terraform confía en el estado y no hace la
#    lectura prohibida. Esto creó los recursos que faltaban y prendió KMS en el
#    stream (StartStreamEncryption sí está permitido).
terraform plan -refresh=false -out=tfplan
terraform apply tfplan
```

### Limitaciones

- **Todo** `plan`, `apply` o `destroy` posterior tiene que llevar `-refresh=false`.
- Sin refresh, Terraform no detecta drift en **ningún** recurso, no solo en estos dos.
- Un despliegue desde cero (el de cualquiera de nosotros después de un `destroy`, o el del docente) falla igual y necesita los mismos pasos manuales.
- El estado de este despliegue está en la máquina de quien hizo el apply (`terraform/terraform.tfstate`, sin backend remoto).

## Opciones

Restricción: tiene que ser Terraform. No podemos reemplazar recursos por CloudFormation.

### 1. Confirmar si el SCP aplica a todos (sin cambiar código)

Los SCP pueden variar entre cursos o cuentas del Lab. Cada uno puede comprobarlo en su cuenta con las credenciales del Lab:

```bash
aws s3api create-bucket --bucket prueba-scp-$RANDOM
aws s3api get-object-lock-configuration --bucket <ese-bucket>   # ¿AccessDenied por SCP?
aws s3api delete-bucket --bucket <ese-bucket>
```

Si alguien ya hizo `apply` de este repo sin este error, el problema es de una cuenta puntual. Si nos pasa a todos, conviene preguntarle al docente si la restricción es intencional y en qué cuenta se va a corregir.

### 2. Crear esos dos recursos con AWS CLI desde Terraform

Un `terraform_data` con `local-exec` crea el bucket (`aws s3api create-bucket`) y el stream (`aws kinesis create-stream` + `start-stream-encryption`), con su `when = destroy` para borrarlos. Todo lo demás (versionado, CORS, lifecycle, policy, consumidores) sigue como recursos normales que apuntan a ellos por nombre.

| A favor | En contra |
|---|---|
| El despliegue desde cero funciona con un `apply` normal. | Esos dos recursos quedan imperativos: Terraform no detecta drift en ellos. |
| El refresh funciona en todo lo demás. | Hace falta la AWS CLI donde corre el `apply`. |
| Solo usa Terraform y el provider de AWS. | Es menos idiomático y requiere un comentario que explique el SCP. |

Falta verificar que el `data "aws_s3_bucket"` no lea también el object lock. Si lo hace, se usa el nombre del bucket directamente.

### 3. Usar el provider `awscc` (`awscc_s3_bucket`, `awscc_kinesis_stream`)

Es un provider oficial de Terraform: HCL, estado y `plan` funcionan igual que siempre. Por dentro habla con AWS a través de otra API (Cloud Control).

| A favor | En contra |
|---|---|
| Si funciona, es la más limpia de las tres: declarativa y con detección de drift. | Cloud Control usa los mismos handlers de recursos que CloudFormation. Hay que confirmar con el docente que no choca con la restricción. |
| | No sabemos si hace las mismas llamadas denegadas. El de S3 probablemente también lee el object lock, así que hay que probarlo. |
| | Mezcla dos providers. |

### 4. Mantener los recursos actuales y documentar la recuperación

El parche se convierte en un script: primer `apply` (falla), `untaint`, refresh dirigido y `apply -refresh=false`.

| A favor | En contra |
|---|---|
| Es el cambio más chico. | El despliegue deja de ser un `apply` normal. |
| Para Kinesis es un paso único: después de recuperarlo, el stream se lee bien. | S3 obliga a `-refresh=false` para siempre: sin detección de drift en todo el proyecto. Es difícil de defender como buena práctica. |

## Recomendación

1. **Primero la opción 1**: no cuesta nada y puede hacer desaparecer el problema.
2. Si el SCP aplica a todos, **probar la opción 3** en el Lab con nombres descartables, unos 15 minutos.
3. Si `awscc` hace las mismas llamadas, o el docente no acepta Cloud Control, **ir por la opción 2**, limitada a estos dos recursos.
