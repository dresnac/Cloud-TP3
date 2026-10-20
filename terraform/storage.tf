resource "aws_s3_bucket" "archivos" {
  bucket_prefix = "${var.proyecto}-archivos-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "archivos" {
  bucket = aws_s3_bucket.archivos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "archivos" {
  bucket = aws_s3_bucket.archivos.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archivos" {
  bucket = aws_s3_bucket.archivos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "archivos" {
  bucket = aws_s3_bucket.archivos.id

  rule {
    id     = "historico"
    status = "Enabled"

    filter {
      prefix = "historico/"
    }

    transition {
      days          = var.historico_lifecycle.dias_standard_ia
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = var.historico_lifecycle.dias_glacier_ir
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = var.historico_lifecycle.dias_expiracion
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  rule {
    id     = "multipart-incompletos"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Las reglas sobre versiones no actuales necesitan el versionado ya activo.
  depends_on = [aws_s3_bucket_versioning.archivos]
}

# El frontend sube el comprobante directo a S3 con el POST firmado que devuelve
# url-comprobante. Solo POST: el bucket no se lee ni se lista desde el navegador.
resource "aws_s3_bucket_cors_configuration" "archivos" {
  bucket = aws_s3_bucket.archivos.id

  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = var.cors_origenes
    allowed_headers = ["content-type"]
    max_age_seconds = 3600
  }
}

data "aws_iam_policy_document" "archivos" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.archivos.arn, "${aws_s3_bucket.archivos.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "archivos" {
  bucket = aws_s3_bucket.archivos.id
  policy = data.aws_iam_policy_document.archivos.json

  depends_on = [aws_s3_bucket_public_access_block.archivos]
}
