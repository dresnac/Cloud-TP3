resource "random_id" "bucket" {
  byte_length = 4
}

data "aws_default_tags" "actual" {}

module "recursos_base" {
  source = "../modules/lambda_function"

  nombre     = "${var.proyecto}-recursos-base"
  source_dir = "${path.module}/lambdas/recursos-base"
  role_arn   = data.aws_iam_role.lab.arn
  timeout    = 600
}

resource "aws_lambda_invocation" "recursos_base" {
  function_name   = module.recursos_base.function_name
  lifecycle_scope = "CRUD"

  input = jsonencode({
    bucket  = "${var.proyecto}-archivos-${random_id.bucket.hex}"
    stream  = "${var.proyecto}-posiciones"
    shards  = 1
    kms_key = "alias/aws/kinesis"
    tags    = data.aws_default_tags.actual.tags
  })
}

locals {
  recursos_base = jsondecode(aws_lambda_invocation.recursos_base.result)

  bucket_archivos       = local.recursos_base.bucket
  bucket_archivos_arn   = local.recursos_base.bucket_arn
  stream_posiciones     = local.recursos_base.stream
  stream_posiciones_arn = local.recursos_base.stream_arn
}
