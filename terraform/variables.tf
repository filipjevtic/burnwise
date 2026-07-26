variable "release_name" {
  description = "Helm release name."
  type        = string
  default     = "burnwise"
}

variable "namespace" {
  description = "Kubernetes namespace to deploy into."
  type        = string
  default     = "burnwise"
}

variable "create_namespace" {
  description = "Create the namespace if it doesn't exist."
  type        = bool
  default     = true
}

variable "chart_path" {
  description = "Path to the Burnwise Helm chart (defaults to the chart in this repo)."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Image tag to deploy. Empty uses the chart's appVersion."
  type        = string
  default     = ""
}

variable "database_url" {
  description = "PostgreSQL connection string (DATABASE_URL). Required unless existing_secret is set."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret used to sign auth tokens. Required unless existing_secret is set."
  type        = string
  default     = ""
  sensitive   = true
}

variable "existing_secret" {
  description = "Name of a pre-existing Secret with the sensitive keys (DATABASE_URL, JWT_SECRET, ...). If set, database_url/jwt_secret are ignored."
  type        = string
  default     = ""
}

variable "app_url" {
  description = "Public URL of the dashboard (used for OAuth redirects and CORS). Usually the ingress URL."
  type        = string
  default     = ""
}

variable "ingress_enabled" {
  description = "Create an Ingress routing a host to the web service."
  type        = bool
  default     = false
}

variable "ingress_host" {
  description = "Ingress host."
  type        = string
  default     = "burnwise.example.com"
}

variable "ingress_class_name" {
  description = "Ingress class name (e.g. nginx)."
  type        = string
  default     = ""
}

variable "extra_values" {
  description = "Additional chart values as a map, merged last (e.g. resources, replicas, config.*)."
  type        = map(string)
  default     = {}
}
