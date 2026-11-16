# Sin cifrado a proposito: CloudWatch Alarms no puede publicar en un topic
# cifrado con la clave administrada aws/sns (su key policy no autoriza al
# servicio cloudwatch.amazonaws.com). Cifrarlo exigiria una CMK propia con una
# key policy a medida. El topic solo transporta el nombre y estado de alarmas,
# sin datos de usuarios.
#tfsec:ignore:aws-sns-enable-topic-encryption
resource "aws_sns_topic" "alertas" {
  name = "${var.proyecto}-alertas"
}

resource "aws_sns_topic_subscription" "alertas_email" {
  count = var.alerta_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.alerta_email
}

locals {
  colas_con_alarma = {
    pedidos-dlq         = aws_sqs_queue.pedidos_dlq.name
    posiciones-fallidas = aws_sqs_queue.posiciones_fallidas.name
  }

  workflows = {
    procesar-pedido   = aws_sfn_state_machine.procesar_pedido.arn
    confirmar-entrega = aws_sfn_state_machine.confirmar_entrega.arn
  }
}

resource "aws_cloudwatch_metric_alarm" "cola_con_mensajes" {
  for_each = local.colas_con_alarma

  alarm_name          = "${var.proyecto}-${each.key}-con-mensajes"
  alarm_description   = "Hay mensajes que no se pudieron procesar en ${each.value}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = each.value }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  ok_actions          = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "workflow_fallido" {
  for_each = local.workflows

  alarm_name          = "${var.proyecto}-${each.key}-fallidas"
  alarm_description   = "Fallaron ejecuciones de ${each.key}."
  namespace           = "AWS/States"
  metric_name         = "ExecutionsFailed"
  dimensions          = { StateMachineArn = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

# ------------------------------------------------------------- presupuesto

# Quien puede publicar en el topic de alertas. Reemplaza a la policy por
# defecto, asi que repite sus permisos para la cuenta y agrega a los dos
# servicios que publican: CloudWatch (alarmas) y Budgets (presupuesto).
data "aws_iam_policy_document" "alertas" {
  statement {
    sid       = "Cuenta"
    actions   = ["SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission", "SNS:DeleteTopic", "SNS:Subscribe", "SNS:ListSubscriptionsByTopic", "SNS:Publish"]
    resources = [aws_sns_topic.alertas.arn]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [data.aws_caller_identity.actual.account_id]
    }
  }

  statement {
    sid       = "Servicios"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alertas.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.actual.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alertas" {
  arn    = aws_sns_topic.alertas.arn
  policy = data.aws_iam_policy_document.alertas.json
}

# Presupuesto de toda la cuenta: en el Learner Lab la cuenta es exclusiva del
# TP, asi que no hace falta filtrar por tags (que ademas exigirian activar
# las cost allocation tags en Billing, que el Lab no permite).
resource "aws_budgets_budget" "mensual" {
  count = var.presupuesto_mensual_usd > 0 ? 1 : 0

  name         = "${var.proyecto}-mensual"
  budget_type  = "COST"
  limit_amount = tostring(var.presupuesto_mensual_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Aviso temprano: el pronostico del mes supera el 80 %.
  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alertas.arn]
  }

  # El gasto real ya supero el presupuesto.
  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alertas.arn]
  }

  # Budgets valida al crear el presupuesto que puede publicar en el topic.
  depends_on = [aws_sns_topic_policy.alertas]
}

# --------------------------------------------------------------- dashboard

locals {
  # Cada widget: titulo y lista de metricas en el formato de CloudWatch
  # ([namespace, metrica, dimension, valor, ...] o una expresion SEARCH).
  dashboard_widgets = [
    {
      titulo = "Pedidos: ejecuciones de procesar-pedido"
      stat   = "Sum"
      metricas = [for m in ["ExecutionsStarted", "ExecutionsSucceeded", "ExecutionsFailed"] :
        ["AWS/States", m, "StateMachineArn", local.workflows["procesar-pedido"]]
      ]
    },
    {
      titulo = "Entregas: ejecuciones de confirmar-entrega"
      stat   = "Sum"
      metricas = [for m in ["ExecutionsStarted", "ExecutionsSucceeded", "ExecutionsFailed"] :
        ["AWS/States", m, "StateMachineArn", local.workflows["confirmar-entrega"]]
      ]
    },
    {
      titulo = "API: pedidos y errores"
      stat   = "Sum"
      metricas = [for m in ["Count", "4xx", "5xx"] :
        ["AWS/ApiGateway", m, "ApiId", aws_apigatewayv2_api.main.id]
      ]
    },
    {
      titulo = "API: latencia p90 (ms)"
      stat   = "p90"
      metricas = [
        ["AWS/ApiGateway", "Latency", "ApiId", aws_apigatewayv2_api.main.id],
        ["AWS/ApiGateway", "IntegrationLatency", "ApiId", aws_apigatewayv2_api.main.id],
      ]
    },
    {
      titulo = "Lambda: errores por funcion"
      stat   = "Sum"
      metricas = [[{
        expression = "SEARCH('{AWS/Lambda,FunctionName} MetricName=\"Errors\" ${var.proyecto}', 'Sum', 300)"
        id         = "errores"
      }]]
    },
    {
      titulo = "Lambda: throttles por funcion"
      stat   = "Sum"
      metricas = [[{
        expression = "SEARCH('{AWS/Lambda,FunctionName} MetricName=\"Throttles\" ${var.proyecto}', 'Sum', 300)"
        id         = "throttles"
      }]]
    },
    {
      titulo = "Posiciones: registros entrantes a Kinesis"
      stat   = "Sum"
      metricas = [
        ["AWS/Kinesis", "IncomingRecords", "StreamName", local.stream_posiciones],
      ]
    },
    {
      titulo = "Posiciones: atraso de los consumidores (IteratorAge, ms)"
      stat   = "Maximum"
      metricas = [for f in [module.actualizar_posicion.function_name, module.archivar_posiciones.function_name] :
        ["AWS/Lambda", "IteratorAge", "FunctionName", f]
      ]
    },
    {
      titulo = "RDS: conexiones y CPU"
      stat   = "Average"
      metricas = [
        ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.main.identifier],
        ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier, { yAxis = "right" }],
      ]
    },
    {
      titulo = "Colas de fallidos (mensajes visibles)"
      stat   = "Maximum"
      metricas = [for cola in values(local.colas_con_alarma) :
        ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", cola]
      ]
    },
  ]
}

resource "aws_cloudwatch_dashboard" "operacion" {
  dashboard_name = "${var.proyecto}-operacion"

  # Grilla de 2 columnas: cada widget ocupa media pantalla (12 de 24).
  dashboard_body = jsonencode({
    widgets = [for i, w in local.dashboard_widgets : {
      type   = "metric"
      x      = (i % 2) * 12
      y      = floor(i / 2) * 6
      width  = 12
      height = 6
      properties = {
        title   = w.titulo
        region  = var.region
        stat    = w.stat
        period  = 300
        view    = "timeSeries"
        stacked = false
        metrics = w.metricas
      }
    }]
  })
}
