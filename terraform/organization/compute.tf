locals {
  capas_db   = [aws_lambda_layer_version.codigo["db"].arn, aws_lambda_layer_version.rds_ca.arn]
  capa_api   = aws_lambda_layer_version.codigo["api"].arn
  entorno_db = { DB_SECRET_ARN = aws_secretsmanager_secret.db.arn }
  vpc_lambda = {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.lambda.id]
  }
}

data "archive_file" "layer" {
  for_each = toset(["db", "api"])

  type        = "zip"
  source_dir  = "${path.module}/layers/${each.key}"
  output_path = "${path.module}/.build/layer-${each.key}.zip"
  excludes    = ["**/__pycache__/**"]
}

resource "aws_lambda_layer_version" "codigo" {
  for_each = data.archive_file.layer

  layer_name          = "${var.proyecto}-${each.key}"
  filename            = each.value.output_path
  source_code_hash    = each.value.output_base64sha256
  compatible_runtimes = ["python3.12"]
}

data "http" "rds_ca" {
  url = "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200 && strcontains(self.response_body, "BEGIN CERTIFICATE")
      error_message = "No se pudo descargar el bundle de CA de RDS."
    }
  }
}

data "archive_file" "layer_rds_ca" {
  type        = "zip"
  output_path = "${path.module}/.build/layer-rds-ca.zip"

  source {
    content  = data.http.rds_ca.response_body
    filename = "rds-ca/global-bundle.pem"
  }
}

resource "aws_lambda_layer_version" "rds_ca" {
  layer_name          = "${var.proyecto}-rds-ca"
  filename            = data.archive_file.layer_rds_ca.output_path
  source_code_hash    = data.archive_file.layer_rds_ca.output_base64sha256
  compatible_runtimes = ["python3.12"]
}

module "migrar_esquema" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-migrar-esquema"
  source_dir = "${path.module}/lambdas/migrar-esquema"
  role_arn   = data.aws_iam_role.lab.arn
  timeout    = 60
  layers     = local.capas_db
  vpc_config = local.vpc_lambda

  environment = merge(local.entorno_db, {
    CARGAR_DATOS_DEMO = tostring(var.cargar_datos_demo)
  })
}

module "api_comercios" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-api-comercios"
  source_dir  = "${path.module}/lambdas/api-comercios"
  role_arn    = data.aws_iam_role.lab.arn
  layers      = concat(local.capas_db, [local.capa_api])
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "recibir_pedido" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-recibir-pedido"
  source_dir = "${path.module}/lambdas/recibir-pedido"
  role_arn   = data.aws_iam_role.lab.arn
  layers     = [local.capa_api]

  environment = {
    QUEUE_URL = aws_sqs_queue.pedidos.url
  }
}

module "crear_pedido" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-crear-pedido"
  source_dir  = "${path.module}/lambdas/crear-pedido"
  role_arn    = data.aws_iam_role.lab.arn
  timeout     = 15
  layers      = local.capas_db
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "iniciar_proceso" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-iniciar-proceso"
  source_dir = "${path.module}/lambdas/iniciar-proceso"
  role_arn   = data.aws_iam_role.lab.arn

  environment = {
    STATE_MACHINE_ARN = aws_sfn_state_machine.procesar_pedido.arn
  }
}

module "api_repartidores" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-api-repartidores"
  source_dir  = "${path.module}/lambdas/api-repartidores"
  role_arn    = data.aws_iam_role.lab.arn
  layers      = concat(local.capas_db, [local.capa_api])
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "registrar_posicion" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-registrar-posicion"
  source_dir = "${path.module}/lambdas/registrar-posicion"
  role_arn   = data.aws_iam_role.lab.arn
  layers     = [local.capa_api]

  environment = {
    STREAM_NAME = local.stream_posiciones
  }
}

module "actualizar_posicion" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-actualizar-posicion"
  source_dir  = "${path.module}/lambdas/actualizar-posicion"
  role_arn    = data.aws_iam_role.lab.arn
  timeout     = 30
  layers      = local.capas_db
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "archivar_posiciones" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-archivar-posiciones"
  source_dir = "${path.module}/lambdas/archivar-posiciones"
  role_arn   = data.aws_iam_role.lab.arn
  timeout    = 30

  environment = {
    BUCKET = local.bucket_archivos
  }
}

module "buscar_repartidor" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-buscar-repartidor"
  source_dir = "${path.module}/lambdas/buscar-repartidor"
  role_arn   = data.aws_iam_role.lab.arn
  timeout    = 15
  layers     = local.capas_db
  vpc_config = local.vpc_lambda

  environment = merge(local.entorno_db, {
    MAX_INTENTOS = tostring(var.asignacion_max_intentos)
    RADIO_METROS = tostring(var.asignacion_radio_metros)
  })
}

module "ofrecer_pedido" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-ofrecer-pedido"
  source_dir  = "${path.module}/lambdas/ofrecer-pedido"
  role_arn    = data.aws_iam_role.lab.arn
  layers      = local.capas_db
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "cerrar_asignacion" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-cerrar-asignacion"
  source_dir  = "${path.module}/lambdas/cerrar-asignacion"
  role_arn    = data.aws_iam_role.lab.arn
  layers      = local.capas_db
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "responder_asignacion" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-responder-asignacion"
  source_dir = "${path.module}/lambdas/responder-asignacion"
  role_arn   = data.aws_iam_role.lab.arn
  layers     = [local.capa_api]
}

module "api_pedidos" {
  source = "../modules/lambda_function"

  nombre      = "${var.proyecto}-api-pedidos"
  source_dir  = "${path.module}/lambdas/api-pedidos"
  role_arn    = data.aws_iam_role.lab.arn
  layers      = concat(local.capas_db, [local.capa_api])
  environment = local.entorno_db
  vpc_config  = local.vpc_lambda
}

module "url_comprobante" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-url-comprobante"
  source_dir = "${path.module}/lambdas/url-comprobante"
  role_arn   = data.aws_iam_role.lab.arn
  layers     = [local.capa_api]

  environment = {
    BUCKET = local.bucket_archivos
  }
}

module "marcar_entregado" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-marcar-entregado"
  source_dir = "${path.module}/lambdas/marcar-entregado"
  role_arn   = data.aws_iam_role.lab.arn
  timeout    = 15
  layers     = local.capas_db
  vpc_config = local.vpc_lambda

  environment = merge(local.entorno_db, {
    BUCKET = local.bucket_archivos
  })
}

module "recibir_entrega" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-recibir-entrega"
  source_dir = "${path.module}/lambdas/recibir-entrega"
  role_arn   = data.aws_iam_role.lab.arn
  layers     = [local.capa_api]

  environment = {
    STATE_MACHINE_ARN = aws_sfn_state_machine.confirmar_entrega.arn
  }
}

module "notificar" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-notificar"
  source_dir = "${path.module}/lambdas/notificar"
  role_arn   = data.aws_iam_role.lab.arn
}

resource "aws_lambda_invocation" "migrar_esquema" {
  function_name = module.migrar_esquema.function_name
  input         = jsonencode({})

  triggers = {
    schema = filesha256("${path.module}/lambdas/migrar-esquema/schema.sql")
    seed   = var.cargar_datos_demo ? filesha256("${path.module}/lambdas/migrar-esquema/seed.sql") : "sin-seed"
  }

  depends_on = [
    aws_db_instance.main,
    aws_secretsmanager_secret_version.db,
    aws_vpc_endpoint.secretsmanager,
    aws_vpc_security_group_egress_rule.lambda_a_rds,
    aws_vpc_security_group_ingress_rule.rds_desde_lambda,
    aws_vpc_security_group_egress_rule.lambda_a_vpce,
    aws_vpc_security_group_ingress_rule.vpce_desde_lambda,
  ]
}
