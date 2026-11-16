data "aws_iam_role" "lab" {
  name = "LabRole"
}

data "aws_caller_identity" "actual" {}
