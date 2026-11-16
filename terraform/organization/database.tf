resource "aws_security_group" "rds" {
  name_prefix = "rds-${var.proyecto}-"
  description = "Acceso a PostgreSQL"
  vpc_id      = module.vpc.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# deletion_protection en false: el destroy del workflow tiene que poder borrar
# la base sin pasos manuales (requisito de la catedra: el TP se levanta y se
# baja desde el pipeline). En produccion iria en true.
# Autenticacion IAM de RDS no se usa: las Lambdas toman usuario y clave de
# Secrets Manager por el endpoint privado de la VPC, y el token IAM exigiria
# permisos rds-db:connect que LabRole no permite configurar.
# Performance Insights no esta disponible para db.t3.micro.
#tfsec:ignore:aws-rds-enable-iam-auth
#tfsec:ignore:aws-rds-enable-performance-insights
resource "aws_db_instance" "main" {
  identifier     = var.proyecto
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = replace(var.proyecto, "-", "_")
  username = "app"
  password = random_password.db.result

  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  # Multi-AZ es un hot standby administrado: replica sincronica en otra AZ y
  # failover automatico del endpoint. Durante el failover se cortan las
  # conexiones abiertas; db.py las descarta y reconecta.
  multi_az = var.db_multi_az

  backup_retention_period = var.db_dias_backup
  skip_final_snapshot     = true
  #tfsec:ignore:aws-rds-enable-deletion-protection
  deletion_protection = false
  apply_immediately   = true

  lifecycle {
    precondition {
      condition     = length(module.vpc.database_subnets) >= 2
      error_message = "Al menos 2 subredes de base de datos son requeridas."
    }
  }
}

# Clave administrada aws/secretsmanager: el secreto solo lo leen las Lambdas
# con LabRole. Una CMK no cambiaria quien puede leerlo en el Lab.
#tfsec:ignore:aws-ssm-secret-use-customer-key
resource "aws_secretsmanager_secret" "db" {
  name_prefix             = "${var.proyecto}-db-"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}
