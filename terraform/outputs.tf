output "proyecto" {
  value = var.proyecto
}

output "stream_posiciones" {
  value = local.stream_posiciones
}

output "bucket_archivos" {
  value = local.bucket_archivos
}

output "migracion" {
  value = jsondecode(aws_lambda_invocation.migrar_esquema.result)
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_ids" {
  value = { for rol, cliente in aws_cognito_user_pool_client.app : rol => cliente.id }
}

output "api_url" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "cola_posiciones_fallidas" {
  value = aws_sqs_queue.posiciones_fallidas.url
}

output "topic_alertas" {
  value = aws_sns_topic.alertas.arn
}


output "asignacion_timeout_segundos" {
  description = "Segundos que tiene el repartidor para responder una oferta (el frontend lo usa para la cuenta regresiva)."
  value       = var.asignacion_timeout_segundos
}

output "asignacion_espera_segundos" {
  description = "Segundos que se busca repartidor antes de cancelar (el frontend lo muestra mientras espera)."
  value       = var.asignacion_espera_segundos
}

output "usuarios_demo" {
  description = "Credenciales de los usuarios de prueba (terraform output -json usuarios_demo)."
  sensitive   = true
  value       = { for email, clave in random_password.usuario_demo : email => clave.result }
}
