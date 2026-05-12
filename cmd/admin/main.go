package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"games-tierlist/internal/adminui"
)

type adminConfig struct {
	Listen     string `json:"listen"`
	APIBaseURL string `json:"api_base_url"`
	AdminToken string `json:"admin_token"`
}

func main() {
	cfg, err := loadAdminConfig("admin.local.json")
	if err != nil {
		log.Fatal(err)
	}

	target, err := url.Parse(cfg.APIBaseURL)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/", adminui.ServeIndex)
	mux.Handle("/admin/", http.StripPrefix("/admin/", adminui.ServeStatic()))

	mux.Handle("/api/", newAPIProxy(target, cfg.AdminToken))
	mux.Handle("/site/", newSiteProxy(target))

	log.Printf("tierlist admin listening on http://%s", cfg.Listen)
	log.Printf("proxying to %s", cfg.APIBaseURL)

	if err := http.ListenAndServe(cfg.Listen, mux); err != nil {
		log.Fatal(err)
	}
}

func loadAdminConfig(path string) (adminConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return adminConfig{}, fmt.Errorf(`config file %q not found (copy admin.local.example.json and fill values)`, path)
		}
		return adminConfig{}, fmt.Errorf("read config: %w", err)
	}

	var cfg adminConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return adminConfig{}, fmt.Errorf("parse config: %w", err)
	}

	cfg.Listen = strings.TrimSpace(cfg.Listen)
	cfg.APIBaseURL = strings.TrimSpace(cfg.APIBaseURL)
	cfg.AdminToken = strings.TrimSpace(cfg.AdminToken)

	if cfg.Listen == "" {
		cfg.Listen = "127.0.0.1:5174"
	}
	if cfg.APIBaseURL == "" {
		return adminConfig{}, errors.New("api_base_url is required in config")
	}
	if cfg.AdminToken == "" {
		return adminConfig{}, errors.New("admin_token is required in config")
	}

	return cfg, nil
}

func newAPIProxy(target *url.URL, token string) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(target)

	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)

		req.Host = target.Host
		req.Header.Set("Authorization", "Bearer "+token)
	}

	return proxy
}

func newSiteProxy(target *url.URL) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(target)

	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)

		req.Host = target.Host

		path := strings.TrimPrefix(req.URL.Path, "/site")
		if path == "" {
			path = "/"
		}

		req.URL.Path = path
	}

	return proxy
}
