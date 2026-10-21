data "aws_availability_zones" "disponibles" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.disponibles.names, 0, 2)

  subredes_app = [for i in range(length(local.azs)) :
  cidrsubnet(var.vpc_cidr, 8, 10 + i)]
  subredes_datos = [for i in range(length(local.azs)) :
  cidrsubnet(var.vpc_cidr, 8, 20 + i)]

  roles = toset(["cliente", "repartidor"])
}
