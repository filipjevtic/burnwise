terraform {
  required_version = ">= 1.3"
  required_providers {
    helm = {
      source = "hashicorp/helm"
      # 2.x: `set`/`set_sensitive` are nested blocks (used below). v3 changed
      # these to list attributes, so pin to the 2.x line.
      version = ">= 2.12, < 3.0.0"
    }
  }
}
