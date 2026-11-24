package main

import (
	"log"
	"net/http"

	"github.com/dataplier/api-gateway/internal/config"
	"github.com/dataplier/api-gateway/internal/router"
)

func main() {
	cfg := config.Load()
	log.Printf("starting api-gateway on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, router.New(cfg)); err != nil {
		log.Fatal(err)
	}
}
