package adminui

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed index.html app.js styles.css
var files embed.FS

func ServeIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	http.ServeFileFS(w, r, files, "index.html")
}

func ServeStatic() http.Handler {
	return http.FileServer(http.FS(files))
}

func FS() fs.FS {
	return files
}
