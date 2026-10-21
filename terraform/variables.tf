variable "region" {
  type    = string
  default = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "Elegir entre us-east-1 o us-west-2."
  }
}

variable "proyecto" {
  type    = string
  default = "delivery"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.proyecto))
    error_message = "Solo minusculas, numeros y guiones, entre 3 y 21 caracteres, empezando con letra."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr tiene que ser un CIDR IPv4 valido."
  }

  validation {
    condition     = endswith(var.vpc_cidr, "/16")
    error_message = "vpc_cidr tiene que ser /16 (las subredes /24 se calculan sumando 8 bits)."
  }
}

variable "archivo_ventana_segundos" {
  description = "Segundos que archivar-posiciones junta posiciones antes de escribir un objeto en S3."
  type        = number
  default     = 60

  validation {
    condition     = var.archivo_ventana_segundos >= 1 && var.archivo_ventana_segundos <= 300
    error_message = "Kinesis admite una ventana de 1 a 300 segundos."
  }
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "historico_lifecycle" {
  description = "Dias hasta pasar historico/ a Standard-IA, a Glacier Instant Retrieval y hasta borrarlo."
  type = object({
    dias_standard_ia = number
    dias_glacier_ir  = number
    dias_expiracion  = number
  })
  default = {
    dias_standard_ia = 30
    dias_glacier_ir  = 90
    dias_expiracion  = 180
  }

  validation {
    condition     = var.historico_lifecycle.dias_standard_ia >= 30
    error_message = "S3 no permite pasar a Standard-IA antes de los 30 dias."
  }

  validation {
    condition = (
      var.historico_lifecycle.dias_standard_ia < var.historico_lifecycle.dias_glacier_ir &&
      var.historico_lifecycle.dias_glacier_ir < var.historico_lifecycle.dias_expiracion
    )
    error_message = "Los dias van en orden: Standard-IA < Glacier IR < expiracion."
  }
}

variable "endpoint_una_az" {
  type    = bool
  default = true
}

variable "asignacion_max_intentos" {
  type    = number
  default = 3

  validation {
    condition     = var.asignacion_max_intentos >= 1 && var.asignacion_max_intentos <= 10
    error_message = "asignacion_max_intentos tiene que estar entre 1 y 10."
  }
}

variable "asignacion_radio_metros" {
  type    = number
  default = 5000
}

variable "asignacion_timeout_segundos" {
  type    = number
  default = 60
}

variable "asignacion_espera_segundos" {
  description = "Segundos que se sigue buscando repartidor cuando no hay ninguno cerca, antes de cancelar el pedido."
  type        = number
  default     = 300

  validation {
    condition     = var.asignacion_espera_segundos >= 0 && var.asignacion_espera_segundos <= 1800
    error_message = "asignacion_espera_segundos tiene que estar entre 0 y 1800."
  }
}

variable "alerta_email" {
  description = "Email que recibe las alarmas. Vacio = sin suscripcion."
  type        = string
  default     = ""

  validation {
    condition     = var.alerta_email == "" || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alerta_email))
    error_message = "alerta_email tiene que ser un email valido o quedar vacio."
  }
}


variable "cors_origenes" {
  description = "Origenes del frontend que pueden llamar a la API y subir comprobantes a S3."
  type        = list(string)
  default     = ["http://localhost:5173"]

  validation {
    condition     = alltrue([for o in var.cors_origenes : can(regex("^https?://[^/*]+$", o))])
    error_message = "Cada origen es esquema + host (+ puerto), sin comodines ni barra final. Ej: http://localhost:5173."
  }
}

variable "cargar_datos_demo" {
  description = "Carga comercios y productos de prueba en la migracion."
  type        = bool
  default     = true
}

variable "usuarios_demo" {
  description = "Usuarios de prueba (email => grupo) que se crean ya confirmados y con contrasena permanente."
  type        = map(string)
  default = {
    "cliente.demo@example.com"    = "cliente"
    "repartidor.demo@example.com" = "repartidor"
  }

  validation {
    condition     = alltrue([for g in values(var.usuarios_demo) : contains(["cliente", "repartidor"], g)])
    error_message = "El grupo tiene que ser cliente o repartidor."
  }
}
