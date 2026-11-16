# AWS Backup para RDS: copia diaria administrada en una boveda propia,
# independiente de los backups automaticos de la instancia.
#
# Los backups automaticos de RDS (db_dias_backup) dan restauracion a un punto
# en el tiempo, pero viven atados a la instancia: se borran con ella. Los
# recovery points de AWS Backup quedan en la boveda aunque se borre la base,
# y es el servicio que permite copiarlos a otra region o cuenta (la base de
# una estrategia de backup & restore o pilot light).
#
# LabRole tiene a backup.amazonaws.com en su trust policy, asi que el servicio
# lo puede asumir para tomar las copias (comprobado en el Learner Lab).

resource "aws_backup_vault" "rds" {
  count = var.backup_rds.habilitado ? 1 : 0

  name = "${var.proyecto}-backups"

  # Sin esto, el destroy del workflow falla si la boveda ya tiene copias.
  # En produccion iria en false y la boveda tendria un vault lock.
  force_destroy = true
}

resource "aws_backup_plan" "rds" {
  count = var.backup_rds.habilitado ? 1 : 0

  name = "${var.proyecto}-rds-diario"

  rule {
    rule_name         = "diario"
    target_vault_name = aws_backup_vault.rds[0].name
    schedule          = var.backup_rds.cron
    start_window      = 60
    completion_window = 180

    lifecycle {
      delete_after = var.backup_rds.dias_retencion
    }
  }
}

resource "aws_backup_selection" "rds" {
  count = var.backup_rds.habilitado ? 1 : 0

  name         = "${var.proyecto}-rds"
  plan_id      = aws_backup_plan.rds[0].id
  iam_role_arn = data.aws_iam_role.lab.arn
  resources    = [aws_db_instance.main.arn]
}
