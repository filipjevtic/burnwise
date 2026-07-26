output "release_name" {
  description = "Name of the Helm release."
  value       = helm_release.burnwise.name
}

output "namespace" {
  description = "Namespace Burnwise was deployed into."
  value       = helm_release.burnwise.namespace
}

output "chart_version" {
  description = "Deployed chart version."
  value       = helm_release.burnwise.version
}
