# Deploys Burnwise by installing its Helm chart (#22). Thin and cloud-agnostic:
# it targets whatever cluster your configured `helm` provider points at, so it
# works on EKS/GKE/AKS/self-managed alike. Provide a reachable PostgreSQL via
# database_url (or existing_secret) — no database is provisioned here.

locals {
  chart_path = var.chart_path != "" ? var.chart_path : "${path.module}/../charts/burnwise"

  # Values set only when non-empty, so the chart's own defaults win otherwise.
  base_values = merge(
    var.image_tag != "" ? { "image.tag" = var.image_tag } : {},
    var.existing_secret != "" ? { "secrets.existingSecret" = var.existing_secret } : {},
    var.app_url != "" ? { "config.appUrl" = var.app_url, "config.serverPublicUrl" = var.app_url } : {},
    var.ingress_enabled ? {
      "ingress.enabled" = "true",
      "ingress.host"    = var.ingress_host,
    } : {},
    var.ingress_class_name != "" ? { "ingress.className" = var.ingress_class_name } : {},
    var.extra_values,
  )

  # Sensitive values kept separate so they can use helm's set_sensitive.
  sensitive_values = var.existing_secret != "" ? {} : merge(
    var.database_url != "" ? { "secrets.databaseUrl" = var.database_url } : {},
    var.jwt_secret != "" ? { "secrets.jwtSecret" = var.jwt_secret } : {},
  )
}

resource "helm_release" "burnwise" {
  name             = var.release_name
  namespace        = var.namespace
  create_namespace = var.create_namespace
  chart            = local.chart_path

  dynamic "set" {
    for_each = local.base_values
    content {
      name  = set.key
      value = set.value
    }
  }

  dynamic "set_sensitive" {
    for_each = local.sensitive_values
    content {
      name  = set_sensitive.key
      value = set_sensitive.value
    }
  }
}
