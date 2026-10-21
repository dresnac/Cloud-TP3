locals {
  reintento_lambda = {
    ErrorEquals = [
      "Lambda.ServiceException",
      "Lambda.AWSLambdaException",
      "Lambda.SdkClientException",
      "Lambda.TooManyRequestsException",
    ]
    IntervalSeconds = 2
    MaxAttempts     = 3
    BackoffRate     = 2
  }
  retry_lambda = jsonencode([local.reintento_lambda])

  # Sin repartidores cerca, BuscarRepartidor se reintenta cada 15 s hasta
  # completar asignacion_espera_segundos; recien ahi se cancela el pedido.
  espera_intervalo = 15
  espera_intentos  = ceil(var.asignacion_espera_segundos / local.espera_intervalo)
}

resource "aws_sfn_state_machine" "procesar_pedido" {
  name     = "${var.proyecto}-procesar-pedido"
  type     = "STANDARD"
  role_arn = data.aws_iam_role.lab.arn

  definition = templatefile("${path.module}/statemachines/procesar-pedido.asl.json.tftpl", {
    crear_pedido_arn      = module.crear_pedido.arn
    buscar_repartidor_arn = module.buscar_repartidor.arn
    ofrecer_pedido_arn    = module.ofrecer_pedido.arn
    cerrar_asignacion_arn = module.cerrar_asignacion.arn
    timeout_oferta        = var.asignacion_timeout_segundos
    retry_lambda          = local.retry_lambda
    reintento_lambda      = jsonencode(local.reintento_lambda)
    espera_intervalo      = local.espera_intervalo
    espera_intentos       = local.espera_intentos
    topic_estado_arn      = aws_sns_topic.estado_pedido.arn
  })
}

resource "aws_sfn_state_machine" "confirmar_entrega" {
  name     = "${var.proyecto}-confirmar-entrega"
  type     = "STANDARD"
  role_arn = data.aws_iam_role.lab.arn

  definition = templatefile("${path.module}/statemachines/confirmar-entrega.asl.json.tftpl", {
    marcar_entregado_arn = module.marcar_entregado.arn
    reintento_lambda     = jsonencode(local.reintento_lambda)
    topic_estado_arn     = aws_sns_topic.estado_pedido.arn
  })
}
