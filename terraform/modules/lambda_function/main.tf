data "archive_file" "zip" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.root}/.build/${var.nombre}.zip"
  excludes    = ["**/__pycache__/**"]
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.nombre}"
  retention_in_days = 7
}

# Lambda entrega los logs unos segundos despues de cada invocacion y, si el log
# group ya no existe, lo vuelve a crear fuera de Terraform y sin retencion. Eso
# rompia el apply siguiente a un destroy. Al destruir, se espera antes de borrar
# el log group para que lleguen los ultimos logs (recursos-base se invoca en el
# mismo destroy).
resource "time_sleep" "logs" {
  destroy_duration = "60s"

  depends_on = [aws_cloudwatch_log_group.this]
}

resource "aws_lambda_function" "this" {
  function_name    = var.nombre
  role             = var.role_arn
  runtime          = "python3.12"
  handler          = "handler.handler"
  filename         = data.archive_file.zip.output_path
  source_code_hash = data.archive_file.zip.output_base64sha256
  timeout          = var.timeout
  layers           = var.layers

  dynamic "environment" {
    for_each = length(var.environment) > 0 ? [1] : []
    content {
      variables = var.environment
    }
  }

  dynamic "vpc_config" {
    for_each = var.vpc_config == null ? [] : [var.vpc_config]
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }

  depends_on = [time_sleep.logs]
}