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
