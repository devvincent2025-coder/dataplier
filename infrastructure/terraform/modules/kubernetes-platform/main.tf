variable "namespace" {
  type = string
}

variable "api_gateway_image" {
  type = string
}

variable "chunk_engine_image" {
  type = string
}

variable "routing_engine_image" {
  type = string
}

variable "transformation_service_image" {
  type = string
}

variable "lineage_service_image" {
  type = string
}

variable "frontend_image" {
  type = string
}

resource "kubernetes_namespace" "this" {
  metadata {
    name = var.namespace
  }
}

resource "kubernetes_deployment" "api_gateway" {
  metadata {
    name      = "api-gateway"
    namespace = kubernetes_namespace.this.metadata[0].name
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "api-gateway"
      }
    }

    template {
      metadata {
        labels = {
          app = "api-gateway"
        }
      }

      spec {
        container {
          name  = "api-gateway"
          image = var.api_gateway_image

          port {
            container_port = 8080
          }
        }
      }
    }
  }
}

resource "kubernetes_deployment" "routing_engine" {
  metadata {
    name      = "routing-engine"
    namespace = kubernetes_namespace.this.metadata[0].name
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "routing-engine"
      }
    }

    template {
      metadata {
        labels = {
          app = "routing-engine"
        }
      }

      spec {
        container {
          name  = "routing-engine"
          image = var.routing_engine_image

          port {
            container_port = 8092
          }
        }
      }
    }
  }
}

resource "kubernetes_deployment" "lineage_service" {
  metadata {
    name      = "lineage-service"
    namespace = kubernetes_namespace.this.metadata[0].name
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "lineage-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "lineage-service"
        }
      }

      spec {
        container {
          name  = "lineage-service"
          image = var.lineage_service_image

          port {
            container_port = 8088
          }
        }
      }
    }
  }
}

resource "kubernetes_deployment" "transformation_service" {
  metadata {
    name      = "transformation-service"
    namespace = kubernetes_namespace.this.metadata[0].name
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "transformation-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "transformation-service"
        }
      }

      spec {
        container {
          name  = "transformation-service"
          image = var.transformation_service_image

          port {
            container_port = 8091
          }
        }
      }
    }
  }
}
