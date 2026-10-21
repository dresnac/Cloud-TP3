provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Proyecto  = var.proyecto
      Materia   = "82.08 Cloud Computing"
      Grupo     = "1"
      ManagedBy = "terraform"
    }
  }
}
