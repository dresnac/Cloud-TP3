resource "aws_apigatewayv2_api" "main" {
  name          = var.proyecto
  protocol_type = "HTTP"

  # API Gateway responde el preflight OPTIONS solo, sin pasar por el
  # authorizer ni por las Lambdas, y agrega los headers CORS a las respuestas.
  cors_configuration {
    allow_origins = var.cors_origenes
    allow_methods = ["GET", "POST", "PUT"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://${aws_cognito_user_pool.main.endpoint}"
    audience = values(aws_cognito_user_pool_client.app)[*].id
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${var.proyecto}"
  retention_in_days = 7
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 50
    throttling_burst_limit = 100
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      ruta      = "$context.routeKey"
      estado    = "$context.status"
      latencia  = "$context.responseLatency"
      usuario   = "$context.authorizer.claims.sub"
      error     = "$context.integrationErrorMessage"
    })
  }
}

locals {
  lambdas_api = {
    api-comercios        = module.api_comercios
    recibir-pedido       = module.recibir_pedido
    api-repartidores     = module.api_repartidores
    registrar-posicion   = module.registrar_posicion
    responder-asignacion = module.responder_asignacion
    api-pedidos          = module.api_pedidos
    url-comprobante      = module.url_comprobante
    recibir-entrega      = module.recibir_entrega
  }

  rutas = {
    "GET /comercios"                    = "api-comercios"
    "GET /comercios/{id}/productos"     = "api-comercios"
    "POST /pedidos"                     = "recibir-pedido"
    "PUT /repartidores/me/estado"       = "api-repartidores"
    "PUT /repartidores/me/posicion"     = "registrar-posicion"
    "GET /asignaciones/pendientes"      = "api-repartidores"
    "POST /asignaciones/{id}/respuesta" = "responder-asignacion"
    "GET /pedidos"                      = "api-pedidos"
    "GET /pedidos/{id}"                 = "api-pedidos"
    "POST /pedidos/{id}/calificacion"   = "api-pedidos"
    "POST /pedidos/{id}/comprobante"    = "url-comprobante"
    "POST /pedidos/{id}/entrega"        = "recibir-entrega"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = local.lambdas_api

  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ruta" {
  for_each = local.rutas

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.value].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "api" {
  for_each = local.lambdas_api

  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

