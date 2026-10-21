terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.28"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }

    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.8"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14"
    }
  }
}
