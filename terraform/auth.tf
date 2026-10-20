resource "aws_cognito_user_pool" "main" {
  name = var.proyecto

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  # Sin registro abierto: el grupo (rol) lo asigna un administrador. Con
  # auto-registro cualquiera podria crearse una cuenta, y asignarle el grupo
  # segun el app client por el que se registra dejaria a cualquiera darse de
  # alta como repartidor.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_group" "rol" {
  for_each = local.roles

  name         = each.key
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "app" {
  for_each = local.roles

  name         = each.key
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"

  # SRP es el login del frontend. ADMIN_USER_PASSWORD_AUTH solo se puede usar
  # con credenciales IAM (cognito-idp:AdminInitiateAuth), nunca desde el
  # navegador. Lo usa scripts/verificar-apply.sh para pedir tokens de usuarios
  # de prueba.
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]
}

resource "random_password" "usuario_demo" {
  for_each = var.usuarios_demo

  length      = 16
  special     = false
  min_upper   = 1
  min_lower   = 1
  min_numeric = 1
}

resource "aws_cognito_user" "demo" {
  for_each = var.usuarios_demo

  user_pool_id   = aws_cognito_user_pool.main.id
  username       = each.key
  password       = random_password.usuario_demo[each.key].result
  message_action = "SUPPRESS"

  attributes = {
    email          = each.key
    email_verified = "true"
  }
}

resource "aws_cognito_user_in_group" "demo" {
  for_each = var.usuarios_demo

  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.rol[each.value].name
  username     = aws_cognito_user.demo[each.key].username
}
