package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"games-tierlist/internal/model"
	"games-tierlist/internal/public"
	"games-tierlist/internal/store"
)

type Server struct {
	store      *store.Store
	token      string
	corsOrigin string
	public     *public.Handler
}

func main() {
	if err := godotenv.Load(".env"); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("env file \".env\": %v", err)
	}

	addr := getenv("ADDR", "127.0.0.1:8087")
	dataDir := getenv("DATA_DIR", "./runtime")
	token := os.Getenv("ADMIN_TOKEN")
	corsOrigin := os.Getenv("CORS_ALLOWED_ORIGIN")

	if token == "" {
		log.Fatal("ADMIN_TOKEN is required (set env or add to .env — see .env.example)")
	}

	st, err := store.New(dataDir)
	if err != nil {
		log.Fatal(err)
	}

	publicHandler, err := public.NewHandler(st)
	if err != nil {
		log.Fatal(err)
	}

	server := &Server{
		store:      st,
		token:      token,
		corsOrigin: corsOrigin,
		public:     publicHandler,
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/", server.public.ServeHome)
	mux.HandleFunc("/assets/site.css", server.public.ServeCSS)

	mux.Handle("/covers/", http.StripPrefix("/covers/", http.FileServer(http.Dir(st.CoversDir()))))

	mux.Handle("/api/data", server.withAuth(http.HandlerFunc(server.handleData)))
	mux.Handle("/api/upload", server.withAuth(http.HandlerFunc(server.handleUpload)))

	log.Printf("tierlist server listening on %s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func (server *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		server.writeCORS(w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		auth := r.Header.Get("Authorization")
		expected := "Bearer " + server.token

		if auth != expected {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (server *Server) writeCORS(w http.ResponseWriter) {
	if server.corsOrigin == "" {
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", server.corsOrigin)
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
}

func (server *Server) handleData(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		data, err := server.store.Read()
		if err != nil {
			http.Error(w, "cannot read data", http.StatusInternalServerError)
			return
		}

		writeJSON(w, data)

	case http.MethodPost:
		defer r.Body.Close()

		var data model.TierlistData

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if err := server.store.Write(data); err != nil {
			http.Error(w, "cannot write data", http.StatusInternalServerError)
			return
		}

		writeJSON(w, map[string]bool{"ok": true})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (server *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const maxMemory = 256 << 20

	if err := r.ParseMultipartForm(maxMemory); err != nil {
		http.Error(w, "cannot parse multipart form", http.StatusBadRequest)
		return
	}

	files := r.MultipartForm.File["covers"]
	labels := r.MultipartForm.Value["labels"]

	uploaded := make([]model.Item, 0, len(files))

	for index, file := range files {
		label := ""

		if index < len(labels) {
			label = labels[index]
		}

		item, err := server.store.SaveUpload(file, label)
		if err != nil {
			http.Error(w, "cannot save uploaded file", http.StatusInternalServerError)
			return
		}

		uploaded = append(uploaded, item)
	}

	writeJSON(w, map[string][]model.Item{
		"items": uploaded,
	})
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(value)
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}
