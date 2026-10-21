terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.28"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.14"
    }
  }
}
