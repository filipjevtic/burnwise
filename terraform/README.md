# Burnwise Terraform module

A thin, cloud-agnostic module that deploys Burnwise by installing its [Helm
chart](../charts/burnwise) into a Kubernetes cluster (#22). It targets whatever
cluster your `helm` provider is configured for (EKS / GKE / AKS / self-managed).

It does **not** provision a database — supply a reachable PostgreSQL via
`database_url` (or `existing_secret`).

## Usage

```hcl
provider "helm" {
  kubernetes {
    config_path = "~/.kube/config" # or configure for your cluster
  }
}

module "burnwise" {
  source = "github.com/filipjevtic/burnwise//terraform"

  namespace    = "burnwise"
  database_url = var.database_url # sensitive
  jwt_secret   = var.jwt_secret  # sensitive
  app_url      = "https://burnwise.example.com"

  ingress_enabled    = true
  ingress_host       = "burnwise.example.com"
  ingress_class_name = "nginx"
}
```

For a local checkout, set `source = "./terraform"` and it uses the chart at
`../charts/burnwise`.

## Inputs

| Name | Default | Notes |
|------|---------|-------|
| `release_name` / `namespace` | `burnwise` | Helm release + namespace |
| `database_url` | `""` | **Required** unless `existing_secret` (sensitive) |
| `jwt_secret` | `""` | **Required** unless `existing_secret` (sensitive) |
| `existing_secret` | `""` | Use a pre-created Secret instead of the two above |
| `app_url` | `""` | Public URL (sets `config.appUrl` + `serverPublicUrl`) |
| `image_tag` | `""` | Defaults to the chart's appVersion |
| `ingress_enabled` / `ingress_host` / `ingress_class_name` | `false` / example / `""` | Ingress |
| `extra_values` | `{}` | Extra chart values (`key = value`) merged last |

Requires the `hashicorp/helm` provider `>= 2.12, < 3.0.0`.
