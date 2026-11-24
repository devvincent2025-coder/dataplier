terraform {
  required_version = ">= 1.6.0"
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

module "platform" {
  source                       = "../../modules/kubernetes-platform"
  namespace                    = "data-plier"
  api_gateway_image            = "dataplier/api-gateway:latest"
  chunk_engine_image           = "dataplier/chunk-engine:latest"
  routing_engine_image         = "dataplier/routing-engine:latest"
  transformation_service_image = "dataplier/transformation-service:latest"
  lineage_service_image        = "dataplier/lineage-service:latest"
  frontend_image               = "dataplier/frontend:latest"
}
