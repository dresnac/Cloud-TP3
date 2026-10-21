resource "aws_sqs_queue" "pedidos_dlq" {
  name                      = "${var.proyecto}-pedidos-dlq.fifo"
  fifo_queue                = true
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "pedidos" {
  name                        = "${var.proyecto}-pedidos.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  sqs_managed_sse_enabled     = true
  visibility_timeout_seconds  = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.pedidos_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_lambda_event_source_mapping" "pedidos" {
  event_source_arn        = aws_sqs_queue.pedidos.arn
  function_name           = module.iniciar_proceso.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
}

resource "aws_sns_topic" "estado_pedido" {
  name              = "${var.proyecto}-estado-pedido"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "notificar" {
  topic_arn = aws_sns_topic.estado_pedido.arn
  protocol  = "lambda"
  endpoint  = module.notificar.arn
}

resource "aws_lambda_permission" "sns_notificar" {
  statement_id  = "AllowSNS"
  action        = "lambda:InvokeFunction"
  function_name = module.notificar.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.estado_pedido.arn
}
