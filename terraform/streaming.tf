# Lotes que agotaron reintentos o edad maxima. Kinesis manda solo metadatos
# (shard y rango de secuencias): con eso se releen del stream mientras sigan
# dentro de la retencion.
resource "aws_sqs_queue" "posiciones_fallidas" {
  name                      = "${var.proyecto}-posiciones-fallidas"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

locals {
  # Cada consumidor tiene necesidades distintas: actualizar-posicion quiere
  # latencia baja y descartar lo viejo; archivar-posiciones quiere lotes
  # grandes (menos objetos en S3) y no perder nada.
  consumidores_posiciones = {
    actualizar-posicion = {
      funcion          = module.actualizar_posicion.arn
      posicion_inicial = "LATEST"
      tamano_lote      = 100
      ventana_segundos = 1
      edad_maxima_seg  = 300 # una posicion de hace mas de 5 min no sirve para asignar
    }
    archivar-posiciones = {
      funcion          = module.archivar_posiciones.arn
      posicion_inicial = "TRIM_HORIZON"
      tamano_lote      = 1000
      ventana_segundos = var.archivo_ventana_segundos
      edad_maxima_seg  = -1 # se archiva todo lo que siga en el stream
    }
  }
}

resource "aws_lambda_event_source_mapping" "posiciones" {
  for_each = local.consumidores_posiciones

  event_source_arn                   = local.stream_posiciones_arn
  function_name                      = each.value.funcion
  starting_position                  = each.value.posicion_inicial
  batch_size                         = each.value.tamano_lote
  maximum_batching_window_in_seconds = each.value.ventana_segundos
  maximum_record_age_in_seconds      = each.value.edad_maxima_seg
  bisect_batch_on_function_error     = true
  maximum_retry_attempts             = 3

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.posiciones_fallidas.arn
    }
  }

  # actualizar-posicion necesita repartidor_posicion: no se consume nada
  # hasta que la migracion del esquema haya corrido.
  depends_on = [aws_lambda_invocation.migrar_esquema]
}
